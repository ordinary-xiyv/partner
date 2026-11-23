package partner

/*
品牌图自动规范化。

【解决的问题】

页头 logo 的高度是锁死的（32px），宽度按原图比例走。于是同一行像素里：

	横版 wordmark（4.7:1）  → 渲染宽 150px，页头左段撑得饱满
	正方形图标（1:1）      → 渲染宽  32px，右边一大片空白

实测两者墨迹高度几乎相同（18.6px vs 17.8px），宽度差 5.5 倍。而且肉眼看
「协调」与否几乎全由宽度决定 —— 高度已经一致了。

更麻烦的是两张图常常还带两样东西：

	· 透明的「画布外留白」—— 导出的正方形头像四周动辄几十上百像素空白，
	  按高度缩放后图形本身只占中间 55%
	· 不透明白底 —— 浅色页头看不出来，切到深色主题就是一个刺眼的白方块

这三件事都不该指望商户自己处理。商户用的是手机里存的图、设计师给的成稿、
微信公众号下载的素材，要求「必须透明底、必须紧裁切、必须 4:1」等于把
配置成本转嫁给不懂设计的人，最后的结果就是大量白方块和缩在角落的小图标。

【处理策略】

只对「明显需要处理」的图动手，判不准就原样存：

	1. 宽高比 < 3.2（图标型）→ 裁掉四周全透明留白。
	   裁完如果还是很窄，说明本来就是方形图标，交由前端补品牌名补足宽度
	   （见 web-user/src/components/Header.tsx 的 needsWordmark）。

	2. 四角是接近纯白、且不透明（alpha ≈ 255）→ 判定为白底图，
	   把白底转成透明。判定必须严格：浅色 logo 本身也可能接近白色，
	   用「四角采样 + 边缘一圈都白」双条件，避免把浅色图形打成半透明。

	3. 已经是透明底且裁得很紧 → 一个字节都不改，原样存。

不做重采样、不缩放到固定尺寸：品牌图可能是 SVG（直接跳过）、可能是
retina 2x 图，改分辨率只会让显示变糊。这里只做「去留白 + 去白底」这类
无损语义修正。

【为什么放在上传环节而不是渲染环节】

渲染环节做的话每个客户端都要下载整张原图再用 canvas 处理，首屏白闪、
CORS 读像素可能被拦（这个 bucket 没开 CORS）、同一张图要重复算。放在
上传环节只算一次，落库的就是处理好的成品。
*/

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	// JPEG 解码器必须显式注册：image.Decode 只认已注册的格式，
	// 而 png 是被下面的 encoder 顺带引入的，jpeg 没有别处引用，
	// 不写这一行就会掉进 "image: unknown format" 而静默跳过处理。
	_ "image/jpeg"
	"image/png"
)

const (
	// 低于这个宽高比视为「图标型」，需要去留白
	iconAspectMax = 3.2

	// 判定「接近纯白」的通道阈值。取 244 是因为 PNG 里常见的 #f8f8f8、
	// #fafafa 这类「设计稿白底」要能覆盖，同时不会把 #e8e8e8 的浅灰
	// 边框算成白。
	nearWhiteChannel = 244

	// 白底判定要求四角 + 边缘采样点里至少这个比例是白的。
	// 1.0 太严（图里只要有一处被裁到边就判不了），0.85 允许少量非白像素。
	whiteBackgroundRatio = 0.85

	// 裁切后额外保留的边距，占长边的比例。完全贴边会让图形「顶格」，
	// 在页头的 32px 高度下看着很挤。
	cropPaddingRatio = 0.02

	// JPEG 转 PNG 后的体积上限。JPEG 的压缩率远高于 PNG，一张 30KB 的白底
	// logo 转成 PNG 可能涨到 60KB —— 涨十倍也还能接受（首屏图），但涨到
	// 几百 KB 就说明这根本不是 logo 而是一张照片，这时候保留 JPEG 更好。
	maxJPEGToPNGBytes = 384 * 1024
)

/*
normalizeBrandImage 对上传的位图做「去留白 + 去白底」。

无法处理的情况一律原样返回（nil, "", false），调用方直接用原始字节：

	· SVG：文本格式，没有像素可分析，也不该改
	· 解码失败（损坏的图、或不支持的编码如 WEBP）
	· 改动没有收益（本来就紧裁的透明 PNG、处理完更大）

第二个返回值是处理后的真实类型。之所以要返回它：JPEG 没有 alpha 通道，
要做出透明底只能重编码成 PNG，而调用方是按这个类型决定对象键扩展名和
Content-Type 的。改字节不改类型，桶里就会出现「扩展名 .jpg、内容是 PNG」
的文件 —— 浏览器按 .jpg 解析大概率显示不出来。

第三个返回值表示「是否真的改动了」，用于日志和测试断言。
*/
func normalizeBrandImage(contentType string, data []byte) ([]byte, string, bool) {
	// SVG 直接跳过：矢量图没有「画布留白」的概念，缩放由客户端处理
	if contentType == "image/svg+xml" {
		return nil, "", false
	}

	src, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", false
	}
	/*
	 * 只处理 PNG 和 JPEG。
	 *
	 * PNG 本身支持 alpha，去白底只是换个表示，无损。
	 * JPEG 没有 alpha，必须转成 PNG 才能透明 —— 这是「白底照片在深色页头
	 * 变成刺眼白方块」的唯一解法，而微信保存的图、网页另存的 logo 绝大多数
	 * 就是 JPEG，漏掉它等于放过了最常见的上传来源。
	 *
	 * WEBP 也支持 alpha，但标准库没有解码器（要引入 golang.org/x/image），
	 * 为一个品牌图加依赖不划算，原样放过。
	 */
	if format != "png" && format != "jpeg" {
		return nil, "", false
	}
	fromJPEG := format == "jpeg"

	bounds := src.Bounds()
	if bounds.Dx() < 8 || bounds.Dy() < 8 {
		return nil, "", false
	}

	// 统一成 RGBA 便于逐像素读写；image.Decode 出来的可能是 *image.NRGBA、
	// *image.Paletted 等，直接断言不可靠
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, src, bounds.Min, draw.Src)

	changed := false

	// ① 白底 → 透明
	if isWhiteBacked(rgba) {
		makeWhiteTransparent(rgba)
		changed = true
	}

	// ② 裁掉全透明留白
	//
	// 但不该见留白就裁。设计良好的横版 wordmark 四周的空白是刻意的光学
	// 边距，裁掉会让字标在 32px 行高里贴边、甚至超出页头给它的横向空间。
	// 实测：横版 1880×400 裁完会变成 7.3:1，渲染宽度从 150px 涨到 230px，
	// 直接撞上容器的 max-width，反而被压小。
	//
	// 只在这两种情况下裁：
	//   · 宽高比 < 3.2 —— 图标型，裁掉能让图形占比更高，配合前端补品牌名
	//   · 墨迹面积占画布不到 30% —— 留白严重到病态，怎么裁都是收益
	if shouldCropToInk(rgba) {
		cropRect := opaqueBounds(rgba)
		if cropRect != bounds {
			// 裁切前先给图形留一点呼吸边距，避免完全顶格
			cropRect = expandRect(cropRect, bounds, cropPaddingRatio)
			if cropRect != bounds {
				cropped := image.NewRGBA(image.Rect(0, 0, cropRect.Dx(), cropRect.Dy()))
				draw.Draw(cropped, cropped.Bounds(), rgba, cropRect.Min, draw.Src)
				rgba = cropped
				changed = true
			}
		}
	}

	if !changed {
		return nil, "", false
	}

	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	if err := enc.Encode(&buf, rgba); err != nil {
		return nil, "", false
	}

	if fromJPEG {
		/*
		 * JPEG 转 PNG 一定会变大（照片压缩比高得多），所以这里不能沿用
		 * 「更大就放弃」的判据，改为卡一个绝对上限。
		 *
		 * 上限取 384KB 而不是 512KB：对象存储那一层还有 512KB 的硬限制，
		 * 留出余量是给「以后可能加的处理步骤」和 multipart 开销。
		 * 超过上限说明这张图不适合转透明（多半是照片而非 logo），
		 * 原样保留 JPEG 比存一个 400KB 的首屏图片更划算。
		 */
		if buf.Len() > maxJPEGToPNGBytes {
			return nil, "", false
		}
	} else if buf.Len() >= len(data) {
		// PNG 之间转换没有收益就不采用：说明原图本来就很紧凑
		return nil, "", false
	}

	return buf.Bytes(), "image/png", true
}

/*
shouldCropToInk 决定这张图是否值得裁掉透明留白。

两个条件满足其一才裁：

 1. 宽高比 < iconAspectMax（3.2）
    图标型图。裁掉留白后图形占比变高，在页头 32px 行高下更饱满；
    裁完若仍然很窄，前端会补品牌名补足横向分量。典型例子就是商户
    上传的方形头像：600×600 里图形只占 460×334。

 2. 墨迹面积占画布 < 30%
    留白严重到病态。这时候不管什么比例，裁掉都是净收益 ——
    用户看到的是「一张大图里有个小图标」，裁完才正常。

横版 wordmark（4~5:1）两个条件都不满足，保持原样：它四周的空白是设计
上的光学边距，裁了会让字标顶格。实测裁切会把 150px 渲染宽推到 230px，
撞上容器上限后被压小，得不偿失。
*/
func shouldCropToInk(img *image.RGBA) bool {
	b := img.Bounds()
	if b.Dy() == 0 {
		return false
	}
	aspect := float64(b.Dx()) / float64(b.Dy())
	if aspect < iconAspectMax {
		return true
	}

	ink := opaqueBounds(img)
	canvasArea := float64(b.Dx()) * float64(b.Dy())
	if canvasArea == 0 {
		return false
	}
	inkArea := float64(ink.Dx()) * float64(ink.Dy())
	return inkArea/canvasArea < 0.30
}

/*
isWhiteBacked 判断这张图是不是「不透明白底」。

早期版本只采 8 个点（四角 + 四边中点）。实测这不够：一张白底但带浅灰渐变
的截图，四角和中点可能恰好都在 250 以上，判定通过，转透明后中间那片没被
处理的灰底就成了一圈「脏边」。现在改为扫描整圈边框 —— 边框厚度取长边的
2%，采样量从 8 个点变成上千个，代价仍可忽略（600×600 的图只多扫约两万像素）。

阈值仍留在 0.85：真实 logo 常有装饰线、圆角裁到边，要求 100% 纯白会漏判。
*/
func isWhiteBacked(img *image.RGBA) bool {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w < 4 || h < 4 {
		return false
	}

	// 边框厚度：长边的 2%，至少 1px
	thickness := w
	if h < thickness {
		thickness = h
	}
	thickness /= 50
	if thickness < 1 {
		thickness = 1
	}

	white, total := 0, 0
	check := func(x, y int) {
		total++
		c := img.RGBAAt(x, y)
		// 必须不透明：透明底图的边缘 alpha 是 0，不能被当成「白」
		if c.A < 250 {
			return
		}
		if c.R >= nearWhiteChannel && c.G >= nearWhiteChannel && c.B >= nearWhiteChannel {
			white++
		}
	}

	for t := 0; t < thickness; t++ {
		// 上下两条横边
		for x := b.Min.X; x < b.Max.X; x++ {
			check(x, b.Min.Y+t)
			check(x, b.Max.Y-1-t)
		}
		// 左右两条竖边。跳过横边已覆盖的上下两段，避免同一像素被数两次
		// 拉偏比例（虽然偏的方向一致，但重复计数会让采样分布失真）。
		for y := b.Min.Y + thickness; y < b.Max.Y-thickness; y++ {
			check(b.Min.X+t, y)
			check(b.Max.X-1-t, y)
		}
	}

	if total == 0 {
		return false
	}
	return float64(white)/float64(total) >= whiteBackgroundRatio
}

/*
makeWhiteTransparent 把接近纯白的像素改成透明。

处理方式是「按亮度反推 alpha」而不是二值化：图形边缘有抗锯齿过渡带，
直接阈值化会留下白色毛边。反推公式相当于把像素视为「纯色 × alpha + 白 × (1-alpha)」，
解出原色和 alpha，边缘就能平滑过渡。

注意只对「白到灰」的低饱和像素生效。彩色像素（哪怕很亮，比如亮黄 #ffff00）
必须保留 —— 品牌色是亮色时把图形也弄透明就毁了。
*/
func makeWhiteTransparent(img *image.RGBA) {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := img.RGBAAt(x, y)
			if c.A == 0 {
				continue
			}
			// 低饱和判定：三通道最大值与最小值之差足够小，才认为它是「白/灰」
			maxC, minC := c.R, c.R
			if c.G > maxC {
				maxC = c.G
			}
			if c.B > maxC {
				maxC = c.B
			}
			if c.G < minC {
				minC = c.G
			}
			if c.B < minC {
				minC = c.B
			}
			if maxC-minC > 24 {
				// 有明确色相，是图形本体，不动
				continue
			}

			// 亮度：越白 alpha 越低
			lum := (int(c.R)*299 + int(c.G)*587 + int(c.B)*114) / 1000
			if lum < nearWhiteChannel {
				continue
			}
			alpha := 255 - lum
			if alpha <= 4 {
				img.SetRGBA(x, y, color.RGBA{0, 0, 0, 0})
				continue
			}
			// 反解原色（去掉白底混入的部分）
			unmix := func(v uint8) uint8 {
				// v = orig*a + 255*(1-a)  →  orig = (v - 255*(1-a)) / a
				num := int(v)*255 - 255*(255-alpha)
				o := num / alpha
				if o < 0 {
					o = 0
				}
				if o > 255 {
					o = 255
				}
				return uint8(o)
			}
			img.SetRGBA(x, y, color.RGBA{unmix(c.R), unmix(c.G), unmix(c.B), uint8(alpha)})
		}
	}
}

/* opaqueBounds 返回非透明像素的包围盒；全透明图返回原边界。 */
func opaqueBounds(img *image.RGBA) image.Rectangle {
	b := img.Bounds()
	minX, minY := b.Max.X, b.Max.Y
	maxX, maxY := b.Min.X-1, b.Min.Y-1

	// 与背景融合起来看：alpha < 8 视为完全透明，避免残留噪点把包围盒撑大
	const alphaFloor = 8
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.RGBAAt(x, y).A <= alphaFloor {
				continue
			}
			if x < minX {
				minX = x
			}
			if x > maxX {
				maxX = x
			}
			if y < minY {
				minY = y
			}
			if y > maxY {
				maxY = y
			}
		}
	}
	if maxX < minX || maxY < minY {
		return b
	}
	return image.Rect(minX, minY, maxX+1, maxY+1)
}

/* expandRect 给裁切框加一圈边距，不超出原边界。 */
func expandRect(r, limit image.Rectangle, ratio float64) image.Rectangle {
	longSide := r.Dx()
	if r.Dy() > longSide {
		longSide = r.Dy()
	}
	pad := int(float64(longSide) * ratio)
	if pad < 2 {
		pad = 2
	}
	out := image.Rect(r.Min.X-pad, r.Min.Y-pad, r.Max.X+pad, r.Max.Y+pad)
	if out.Min.X < limit.Min.X {
		out.Min.X = limit.Min.X
	}
	if out.Min.Y < limit.Min.Y {
		out.Min.Y = limit.Min.Y
	}
	if out.Max.X > limit.Max.X {
		out.Max.X = limit.Max.X
	}
	if out.Max.Y > limit.Max.Y {
		out.Max.Y = limit.Max.Y
	}
	return out
}
