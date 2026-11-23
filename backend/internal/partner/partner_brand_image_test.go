package partner

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"testing"
)

/* solidPNG 造一张纯色不透明图，用于验证「不白底就不该处理」 */
func solidPNG(t *testing.T, w, h int, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

/* whiteSquareWithInk 造「白底 + 居中色块 + 大片留白」，模拟商户传的方形头像 */
func whiteSquareWithInk(t *testing.T, size, inkW, inkH int, ink color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	// 先铺白
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.SetRGBA(x, y, color.RGBA{255, 255, 255, 255})
		}
	}
	// 中央画墨块
	x0 := (size - inkW) / 2
	y0 := (size - inkH) / 2
	for y := y0; y < y0+inkH; y++ {
		for x := x0; x < x0+inkW; x++ {
			img.SetRGBA(x, y, ink)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

/*
白底 + 大留白的方形图，规范化后必须满足三条：
 1. 四角变成透明（白底没了）
 2. 画布被裁小（留白没了）
 3. 图形本身的颜色还在（没被误伤）
*/
func TestNormalizeBrandImage_WhiteSquareCropped(t *testing.T) {
	in := whiteSquareWithInk(t, 600, 200, 200, color.RGBA{30, 90, 240, 255})

	out, typ, ok := normalizeBrandImage("image/png", in)
	if !ok {
		t.Fatal("白底方形图应当被处理，但返回了未改动")
	}
	if typ != "image/png" {
		t.Fatalf("PNG 处理后类型不该变，实际 %q", typ)
	}

	img, err := png.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	b := img.Bounds()

	if b.Dx() >= 600 || b.Dy() >= 600 {
		t.Fatalf("留白没有被裁掉，输出仍是 %dx%d", b.Dx(), b.Dy())
	}
	// 裁完应该接近墨块尺寸 + 2% 边距，不该再是整张 canvas
	if b.Dx() > 260 {
		t.Fatalf("裁切过度保守，宽度 %d 仍然偏大", b.Dx())
	}

	// 四角必须透明
	corners := [][2]int{{b.Min.X, b.Min.Y}, {b.Max.X - 1, b.Min.Y}, {b.Min.X, b.Max.Y - 1}, {b.Max.X - 1, b.Max.Y - 1}}
	for _, p := range corners {
		r, _, _, a := img.At(p[0], p[1]).RGBA()
		if a > 0x1000 { // alpha 仍明显不透明
			t.Fatalf("角点 (%d,%d) 没有变透明，alpha=%d", p[0], p[1], a)
		}
		_ = r
	}

	// 中心必须仍是蓝色（不能被白底转透明的逻辑误伤）
	cr, cg, cb, ca := img.At(b.Min.X+b.Dx()/2, b.Min.Y+b.Dy()/2).RGBA()
	if ca < 0x8000 {
		t.Fatalf("图形中心被误判成透明，alpha=%d", ca)
	}
	if !(cb > cr && cb > cg) {
		t.Fatalf("图形中心颜色被改坏了: r=%d g=%d b=%d", cr, cg, cb)
	}
}

/* 已经是紧裁的透明图，不该再动它 —— 反复上传不能逐次变差 */
func TestNormalizeBrandImage_TransparentTightUnchanged(t *testing.T) {
	// 造一张边缘就是图形的透明图：没有留白、没有白底
	size := 40
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			// 全部填成不透明的深色 → 包围盒就是整张图 → 无需裁切
			// 四角也是深色 → 不是白底 → 无需转透明
			img.SetRGBA(x, y, color.RGBA{20, 40, 80, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}

	if _, _, ok := normalizeBrandImage("image/png", buf.Bytes()); ok {
		t.Fatal("紧裁的深色图不该被改动")
	}
}

/* SVG 必须原样放过：矢量图没有像素可分析 */
func TestNormalizeBrandImage_SVGUntouched(t *testing.T) {
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#1e5af0"/></svg>`)
	if _, _, ok := normalizeBrandImage("image/svg+xml", svg); ok {
		t.Fatal("SVG 不该被规范化")
	}
}

/* 亮黄这类高饱和亮色不能被当成白底吃掉 */
func TestNormalizeBrandImage_BrightYellowKept(t *testing.T) {
	// 纯黄底、中间画红块：四角是黄（不白）→ 不该触发白底转换
	in := solidPNG(t, 60, 60, color.RGBA{255, 230, 0, 255})
	out, _, ok := normalizeBrandImage("image/png", in)
	if ok {
		t.Fatalf("纯黄底不应被处理，却返回了改动后的 %d 字节（原 %d）", len(out), len(in))
	}
}

/*
白底 JPEG 必须被处理，且类型要改成 PNG。

这是最容易被漏掉的分支：微信保存的图、网页另存的 logo 绝大多数是 JPEG，
而 JPEG 没有 alpha，不转 PNG 就永远做不出透明底。同时返回的类型必须是
image/png —— 否则调用方会按 .jpg 存进桶里，内容和扩展名对不上就是破图。
*/
func TestNormalizeBrandImage_WhiteJPEGConvertsToPNG(t *testing.T) {
	// 造白底方形图，编码成 JPEG
	src := whiteSquareWithInk(t, 400, 160, 160, color.RGBA{30, 90, 240, 255})
	pngImg, err := png.Decode(bytes.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	var jpgBuf bytes.Buffer
	if err := jpeg.Encode(&jpgBuf, pngImg, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}

	out, typ, ok := normalizeBrandImage("image/jpeg", jpgBuf.Bytes())
	if !ok {
		t.Fatal("白底 JPEG 应当被处理，实际未改动")
	}
	if typ != "image/png" {
		t.Fatalf("JPEG 转透明后类型必须改成 image/png，实际 %q", typ)
	}

	// 输出必须能被 PNG 解码（即真的是 PNG 而不是 JPEG 字节）
	oImg, err := png.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("输出不是合法 PNG：%v", err)
	}
	ob := oImg.Bounds()
	if ob.Dx() >= 400 || ob.Dy() >= 400 {
		t.Fatalf("留白没被裁掉，输出 %dx%d", ob.Dx(), ob.Dy())
	}

	// 角上要透明
	_, _, _, a := oImg.At(ob.Min.X, ob.Min.Y).RGBA()
	if a > 0x1000 {
		t.Fatalf("JPEG 白底没转成透明，角点 alpha=%d", a)
	}
}

/*
四角纯白但中间是「照片」的图：转 PNG 会变得极大，必须放弃转换。
判据是绝对大小而不是「比原图大」—— JPEG 转 PNG 必然变大，
用相对比较会让这条分支永不触发。
*/
func TestNormalizeBrandImage_HugeJPEGKeepsOriginal(t *testing.T) {
	// 造一张 1200x1200 的复杂噪点图：JPEG 压得很小，PNG 会很大
	const size = 1200
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			// 边缘铺白（触发白底判定），内部铺高频噪点（让 PNG 压不下去）
			if x < 8 || y < 8 || x >= size-8 || y >= size-8 {
				img.SetRGBA(x, y, color.RGBA{255, 255, 255, 255})
				continue
			}
			img.SetRGBA(x, y, color.RGBA{
				uint8((x*7 + y*13) % 256),
				uint8((x*31 + y*17) % 256),
				uint8((x*3 + y*29) % 256),
				255,
			})
		}
	}
	var jpgBuf bytes.Buffer
	if err := jpeg.Encode(&jpgBuf, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	t.Logf("原始 JPEG %d 字节", jpgBuf.Len())

	out, typ, ok := normalizeBrandImage("image/jpeg", jpgBuf.Bytes())
	if ok {
		t.Fatalf("转 PNG 后超过上限就该放弃，实际采用了 %d 字节（%s）", len(out), typ)
	}
	t.Logf("已按预期放弃（%d 字节的 JPEG 转 PNG 会超过 %d 上限）", jpgBuf.Len(), maxJPEGToPNGBytes)
}

/* 用真实文件验证：仓库外的样例缺失时跳过，不让 CI 红 */
func TestNormalizeBrandImage_RealFiles(t *testing.T) {
	cases := []struct {
		path    string
		wantCut bool
		desc    string
	}{
		{"/tmp/lv/sq-white.png", true, "方形白底 600x600（应裁切+去白底）"},
		{"/tmp/lv/wide.png", false, "横版透明 1880x400（应保持原样或仅微调）"},
	}
	for _, c := range cases {
		data, err := os.ReadFile(c.path)
		if err != nil {
			t.Logf("跳过 %s：%v", c.desc, err)
			continue
		}
		out, typ, ok := normalizeBrandImage("image/png", data)
		inImg, _ := png.Decode(bytes.NewReader(data))
		ib := inImg.Bounds()

		if c.wantCut {
			if !ok {
				t.Errorf("%s：期望被处理，实际未改动", c.desc)
				continue
			}
			if typ != "image/png" {
				t.Errorf("%s：PNG 处理后类型不该变，实际 %q", c.desc, typ)
			}
			oImg, _ := png.Decode(bytes.NewReader(out))
			ob := oImg.Bounds()
			t.Logf("%s：%dx%d → %dx%d，%d → %d 字节",
				c.desc, ib.Dx(), ib.Dy(), ob.Dx(), ob.Dy(), len(data), len(out))
			if ob.Dx() >= ib.Dx() {
				t.Errorf("%s：宽度没有变小", c.desc)
			}
			// 裁切后宽高比应该接近真实墨迹比（460:334 ≈ 1.38）
			ratio := float64(ob.Dx()) / float64(ob.Dy())
			if ratio < 1.2 || ratio > 1.7 {
				t.Errorf("%s：裁切后宽高比 %.2f 偏离预期 1.2~1.7", c.desc, ratio)
			}
		} else {
			t.Logf("%s：ok=%v，%d 字节 → %d 字节", c.desc, ok, len(data), len(out))
			if ok {
				oImg, _ := png.Decode(bytes.NewReader(out))
				ob := oImg.Bounds()
				// 横版图本来就紧凑，即便被处理也不该把宽高比改坏
				inRatio := float64(ib.Dx()) / float64(ib.Dy())
				outRatio := float64(ob.Dx()) / float64(ob.Dy())
				if outRatio < inRatio*0.8 {
					t.Errorf("%s：宽高比被改变过大 %.2f → %.2f", c.desc, inRatio, outRatio)
				}
			}
		}
	}
}
