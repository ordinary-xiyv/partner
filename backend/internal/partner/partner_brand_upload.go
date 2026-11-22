package partner

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos/enum"

	"partner/internal/model"
)

/*
品牌图片上传。

复用的是 lynxtonapi 系统设置里**已经配好的那套对象存储**（options 表里的
object_storage_setting.*）。不另配一份的原因很直接：同一个平台的两套后台，
上传的图落在同一个 bucket 才方便统一清理和迁移；各配一套的结果是运维要维护
两份凭证，而它们指向的往往是同一个 bucket。

读取方式：直接查 options 表。数据库里存的 access_key_secret 就是明文原值
（lynxtonapi 保存时只做 TrimSpace，见 controller/option.go 的
objectStorageSecretUpdateValue），所以这里不需要解密逻辑。

上传流程走「后端中转」，图片经本服务转发到对象存储 —— 不是预签名直传。

为什么不做直传：实测这个 bucket 没开 CORS（OPTIONS 预检返回
"AccessDenied: CORS is not enabled for this bucket"），浏览器发起的跨域
PUT 会被拦在预检阶段。直传确实更省服务器带宽，但它前提是 bucket 开了 CORS
并把 PUT、Content-Type 等头都列进白名单 —— 那是运维侧的云配置，
不该成为「能不能传图」的阻塞项。中转只需要服务端出网，任何环境都能跑。

代价是图片流量要过一遍本服务。品牌图上限 512KB，且只在商户改 logo 时传一次，
这个量级对伙伴后端没有压力。读取侧用 http.MaxBytesReader + io.LimitReader
双层卡住上限，避免超长请求把内存吃掉。
*/

const (
	// 品牌图最大 512KB：首屏要加载，再大就成了拖慢客户站的因素
	maxBrandImageBytes = 512 * 1024

	// 上传请求的整体超时。国内到 TOS 一般一两秒，给到 30 秒足够且能兜住慢网。
	uploadTimeout = 30 * time.Second

	// multipart 有边界、分隔符、其他表单字段的额外开销，
	// 请求体上限比图片上限再多给 1MB，避免合法的小图被整体限流误杀。
	uploadRequestOverhead = 1 << 20
)

// 上传落点。用常量而不是散落的字面量，是因为这两个字符串同时出现在
// 前端表单字段名、后端 payload 字段名和这里的判断分支里，写错一个就是静默失败
// （上传成功但配置没更新，页面看起来「点了没反应」）。
const (
	brandTargetLogo    = "logo_url"
	brandTargetFavicon = "favicon_url"
)

var (
	errStorageNotConfigured = errors.New("对象存储未配置，请联系平台在系统设置里填写")
	errBrandImageTooLarge   = errors.New("图片超过 512KB，建议压缩后再上传")
	errBrandImageType       = errors.New("只支持 PNG、JPEG、WEBP 或 SVG 图片")
	errBrandUploadEmpty     = errors.New("没有收到图片内容")
	errBrandUploadTarget    = errors.New("上传目标无效")
)

// 品牌图允许的类型 → 扩展名。故意不含 GIF：品牌 logo 用动图没有实际意义，
// 而 GIF 解析是历史上多个图片处理库的漏洞来源。
var brandImageExt = map[string]string{
	"image/png":     ".png",
	"image/jpeg":    ".jpg",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
}

// 扩展名 → 类型。浏览器偶尔不上报 Content-Type（某些系统文件管理器拖拽、
// 或用脚本直接构造 form 时），这时按扩展名兜底，好过直接判成非法类型。
var brandImageTypeByExt = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
}

// objectStorageConfig 从 options 表读出的对象存储配置。
type objectStorageConfig struct {
	Provider        string
	Region          string
	Endpoint        string
	Bucket          string
	AccessKeyID     string
	AccessKeySecret string
	KeyPrefix       string
	KeyTemplate     string
}

func (c objectStorageConfig) configured() bool {
	return c.Endpoint != "" && c.Bucket != "" && c.AccessKeyID != "" && c.AccessKeySecret != ""
}

/*
optionRow 对应 lynxtonapi 的 options 表。

`key` 和 `value` 都是 SQL 保留字，不同方言的转义符号不同（MySQL 用反引号，
PostgreSQL 用双引号）。所以这里不手写列名到 SQL 里，而是：

	· 用 Find(&rows) 让 GORM 按方言生成 SELECT 列表（它会正确加引号）
	· 过滤放在 Go 里做，避免 WHERE 子句里出现保留字

整表只有一百多行，一次读全的开销远小于处理方言差异带来的复杂度。
*/
type optionRow struct {
	Key   string `gorm:"column:key"`
	Value string `gorm:"column:value"`
}

func (optionRow) TableName() string { return "options" }

const objectStoragePrefix = "object_storage_setting."

func loadObjectStorageConfig() (objectStorageConfig, error) {
	var rows []optionRow
	if err := model.DB.Find(&rows).Error; err != nil {
		return objectStorageConfig{}, err
	}
	values := make(map[string]string, len(rows))
	for _, row := range rows {
		if !strings.HasPrefix(row.Key, objectStoragePrefix) {
			continue
		}
		values[strings.TrimPrefix(row.Key, objectStoragePrefix)] = row.Value
	}
	cfg := objectStorageConfig{
		Provider:        strings.TrimSpace(values["provider"]),
		Region:          strings.TrimSpace(values["region"]),
		Endpoint:        strings.TrimSpace(values["endpoint"]),
		Bucket:          strings.TrimSpace(values["bucket"]),
		AccessKeyID:     strings.TrimSpace(values["access_key_id"]),
		AccessKeySecret: strings.TrimSpace(values["access_key_secret"]),
		KeyPrefix:       strings.Trim(strings.TrimSpace(values["key_prefix"]), "/"),
		KeyTemplate:     strings.TrimSpace(values["key_template_site_logo"]),
	}
	if cfg.Region == "" {
		cfg.Region = "cn-beijing"
	}
	if cfg.KeyPrefix == "" {
		cfg.KeyPrefix = "lynx"
	}
	if cfg.KeyTemplate == "" {
		cfg.KeyTemplate = "{key_prefix}/branding/site-logo/{user_id}/{file_id}/{filename}"
	}
	if !cfg.configured() {
		return cfg, errStorageNotConfigured
	}
	return cfg, nil
}

// sdkEndpoint 给 SDK 用的端点：不带协议头，TOS SDK 要的是 host 形式。
func (c objectStorageConfig) sdkEndpoint() string {
	endpoint := strings.TrimSpace(c.Endpoint)
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	return strings.TrimSuffix(endpoint, "/")
}

// publicHost 公网访问域名：{bucket}.{endpoint_host}
func (c objectStorageConfig) publicHost() string {
	return c.Bucket + "." + c.sdkEndpoint()
}

// publicURL 对象的公网直链。客户站会把它直接写进 <img src>。
func (c objectStorageConfig) publicURL(objectKey string) string {
	return "https://" + c.publicHost() + "/" + strings.TrimPrefix(objectKey, "/")
}

func (c objectStorageConfig) newClient() (*tos.ClientV2, error) {
	return tos.NewClientV2(c.sdkEndpoint(),
		tos.WithRegion(c.Region),
		tos.WithCredentials(tos.NewStaticCredentials(c.AccessKeyID, c.AccessKeySecret)),
	)
}

/*
objectKey 按平台既有模板生成对象键。

模板里的 {user_id} 对伙伴体系没有意义（伙伴登录的是商户，不是 users 表里的用户），
这里传 -1 占位，与平台上已有的自营站点 logo 保持一致——
那些文件的对象键就是 .../site-logo/-1/...，沿用同一个形态便于按前缀做批量清理。
*/
func (c objectStorageConfig) objectKey(merchantID int64, fileID, filename string) string {
	key := c.KeyTemplate
	key = strings.ReplaceAll(key, "{key_prefix}", c.KeyPrefix)
	key = strings.ReplaceAll(key, "{user_id}", "-1")
	key = strings.ReplaceAll(key, "{file_id}", fileID)
	key = strings.ReplaceAll(key, "{filename}", filename)
	// 商户 ID 单独一段，方便按商户定位和清理
	key = strings.ReplaceAll(key, "{merchant_id}", fmt.Sprintf("%d", merchantID))
	return strings.TrimPrefix(key, "/")
}

var unsafeFilenameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func safeFilename(name string) string {
	base := path.Base(strings.TrimSpace(name))
	base = unsafeFilenameChars.ReplaceAllString(base, "_")
	base = strings.Trim(base, "._-")
	if base == "" {
		base = "logo"
	}
	if len(base) > 80 {
		base = base[:80]
	}
	return base
}

func newFileID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

/*
normalizeBrandTarget 把前端传来的 target 归一。

只认 logo_url / favicon_url 两个落点，空值默认 logo —— 商户点「上传 logo」
是主路径，漏传 target 时按主路径处理比报错更合理。
*/
func normalizeBrandTarget(raw string) (string, error) {
	target := strings.ToLower(strings.TrimSpace(raw))
	switch target {
	case "":
		return brandTargetLogo, nil
	case brandTargetLogo, brandTargetFavicon:
		return target, nil
	default:
		return "", errBrandUploadTarget
	}
}

/*
resolveBrandContentType 定出这次上传的类型。

优先用浏览器上报的，为空时按扩展名兜底。两者都不认就拒绝 ——
宁可让用户重存一张，也不要把未知类型的字节丢进公网可读的 bucket。
*/
func resolveBrandContentType(declared, filename string) (string, error) {
	contentType := strings.ToLower(strings.TrimSpace(declared))
	// 有些客户端会带 "; charset=..." 之类参数，取分号前的主类型
	if idx := strings.IndexByte(contentType, ';'); idx >= 0 {
		contentType = strings.TrimSpace(contentType[:idx])
	}
	if _, ok := brandImageExt[contentType]; ok {
		return contentType, nil
	}
	if contentType == "" {
		ext := strings.ToLower(path.Ext(strings.TrimSpace(filename)))
		if byExt, ok := brandImageTypeByExt[ext]; ok {
			return byExt, nil
		}
	}
	return "", errBrandImageType
}

/*
validateBrandImageBytes 按声明的类型复核真实字节。

只信客户端声明的 Content-Type 是不够的：把一段 HTML 改名成 .png 传上来，
对象存储会按 image/png 存进公网可读的 bucket，谁把地址贴进浏览器就执行一段
脚本。虽然存储域名和客户站不同源、危害有限，但「托管用户可控的任意内容」
本身就该在入口挡住。

PNG 除了 8 字节签名还要求紧跟 IHDR —— 只验签名的话，一张只有签名的 8 字节
文件也能通过，客户站上就是破图。

SVG 是文本没法用魔数判断，改为要求开头就是 <svg> 或 XML 声明后跟 <svg>。
SVG 里可以写 <script>，用 <img> 引用时不会执行；直接打开时脚本跑在存储域名上，
不在客户站的源里，所以保留 SVG 是可接受的。
*/
func validateBrandImageBytes(declared string, data []byte) error {
	if len(data) == 0 {
		return errBrandUploadEmpty
	}
	switch declared {
	case "image/png":
		if len(data) < 16 || !bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) ||
			!bytes.Equal(data[12:16], []byte("IHDR")) {
			return errBrandImageType
		}
	case "image/jpeg":
		if len(data) < 4 || !bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}) {
			return errBrandImageType
		}
	case "image/webp":
		if len(data) < 16 || !bytes.Equal(data[0:4], []byte("RIFF")) || !bytes.Equal(data[8:12], []byte("WEBP")) {
			return errBrandImageType
		}
	case "image/svg+xml":
		if !looksLikeSVG(data) {
			return errBrandImageType
		}
	}
	return nil
}

// looksLikeSVG 只在文件开头找根标签，不整文件扫 —— 免得一个几十 KB 的
// 合法 SVG 因为注释里写了 "<script" 就被误判。
func looksLikeSVG(data []byte) bool {
	head := bytes.TrimSpace(data)
	if len(head) > 4096 {
		head = head[:4096]
	}
	head = bytes.ToLower(head)
	if bytes.HasPrefix(head, []byte("<?xml")) {
		return bytes.Contains(head, []byte("<svg"))
	}
	return bytes.HasPrefix(head, []byte("<svg"))
}

/*
uploadBrandImage 把图片经本服务中转写进对象存储，然后回写 brand_* 列。

落库为什么放在上传里，而不是让前端拿到 URL 再点保存：
「传成功」和「配置已更新」做成一次请求，就不会出现「图在桶里躺着、客户站
还是旧 logo」。前端拿到返回值直接刷表单即可，不需要再发一次 PUT /brand。

size 参数只用来提前拦超限请求（fileHeader.Size 可能为 0，比如分块上传），
真正的上限由读取时的 LimitReader 保证。
*/
func uploadBrandImage(merchantID int64, target, filename, contentType string, content io.Reader, size int64) (MerchantBrand, error) {
	if merchantID <= 0 {
		return MerchantBrand{}, errors.New("invalid merchant ID")
	}
	target, err := normalizeBrandTarget(target)
	if err != nil {
		return MerchantBrand{}, err
	}
	if size > maxBrandImageBytes {
		return MerchantBrand{}, errBrandImageTooLarge
	}
	contentType, err = resolveBrandContentType(contentType, filename)
	if err != nil {
		return MerchantBrand{}, err
	}
	cfg, err := loadObjectStorageConfig()
	if err != nil {
		return MerchantBrand{}, err
	}

	/*
	 * 多读 1 字节用来区分「刚好 512KB」和「超过 512KB」。
	 * 只读到 maxBrandImageBytes 的话，超限和恰好等于上限都是同样长度，
	 * 没法判断该不该拒。
	 */
	data, err := io.ReadAll(io.LimitReader(content, maxBrandImageBytes+1))
	if err != nil {
		return MerchantBrand{}, err
	}
	if int64(len(data)) > maxBrandImageBytes {
		return MerchantBrand{}, errBrandImageTooLarge
	}
	if err := validateBrandImageBytes(contentType, data); err != nil {
		return MerchantBrand{}, err
	}

	client, err := cfg.newClient()
	if err != nil {
		return MerchantBrand{}, err
	}
	fileID, err := newFileID()
	if err != nil {
		return MerchantBrand{}, err
	}
	fileBase := safeFilename(strings.TrimSuffix(path.Base(strings.TrimSpace(filename)), path.Ext(filename)))
	objectKey := cfg.objectKey(merchantID, fileID, fileBase+brandImageExt[contentType])

	ctx, cancel := context.WithTimeout(context.Background(), uploadTimeout)
	defer cancel()
	_, err = client.PutObjectV2(ctx, &tos.PutObjectV2Input{
		PutObjectBasicInput: tos.PutObjectBasicInput{
			Bucket: cfg.Bucket,
			Key:    objectKey,
			// 品牌 logo 是公开资源，客户站要直接 <img src> 引。
			// 私有读会导致每次首屏加载都要后端签一次 URL，多一轮往返。
			ACL:           enum.ACLPublicRead,
			ContentType:   contentType,
			ContentLength: int64(len(data)),
		},
		Content: bytes.NewReader(data),
	})
	if err != nil {
		return MerchantBrand{}, fmt.Errorf("写入对象存储失败: %w", err)
	}

	publicURL := cfg.publicURL(objectKey)
	if len(publicURL) > maxBrandURL {
		return MerchantBrand{}, errors.New("图片地址过长")
	}
	/*
	 * 写回对应的列。logo_url 和 favicon_url 是同一个上传流程的两个落点，
	 * 由后端根据 target 决定写哪一列，而不是让浏览器自己拼 payload。
	 *
	 * 旧对象不做删除：桶是和 lynxtonapi 共用的，同一个对象键可能还被别的记录
	 * 引用（比如平台自营站点的那份 logo）；为了省几百 KB 冒「删掉别处在用的图」
	 * 的风险不划算。真要清理，按 site-logo 前缀做定期巡检更安全。
	 */
	input := merchantBrandInput{}
	if target == brandTargetFavicon {
		input.FaviconURL = &publicURL
	} else {
		input.LogoURL = &publicURL
	}
	return UpdateMerchantBrand(merchantID, input)
}

func brandUploadError(c *gin.Context, err error) {
	var maxBytesErr *http.MaxBytesError
	switch {
	case errors.As(err, &maxBytesErr):
		partnerError(c, http.StatusBadRequest, errBrandImageTooLarge.Error())
	case errors.Is(err, errStorageNotConfigured):
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": err.Error()})
	case errors.Is(err, errBrandImageTooLarge), errors.Is(err, errBrandImageType),
		errors.Is(err, errBrandUploadEmpty), errors.Is(err, errBrandUploadTarget):
		partnerError(c, http.StatusBadRequest, err.Error())
	default:
		partnerError(c, http.StatusInternalServerError, "上传失败，请稍后重试")
	}
}

/*
BrandUploadAPI POST /api/partner/brand/upload（multipart/form-data）

字段：

	· file   —— 图片本体，必填
	· target —— logo_url / favicon_url，留空按 logo_url

先卡请求体上限再解析 multipart，是因为 FormFile 会把文件落到临时文件，
不先卡住的话，一个几个 G 的请求会先把磁盘写满才发现超限。
*/
func BrandUploadAPI(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBrandImageBytes+uploadRequestOverhead)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		brandUploadError(c, err)
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		partnerError(c, http.StatusBadRequest, "图片读取失败，请重试")
		return
	}
	defer file.Close()

	brand, err := uploadBrandImage(
		c.GetInt64("partner_merchant_id"),
		c.PostForm("target"),
		fileHeader.Filename,
		fileHeader.Header.Get("Content-Type"),
		file,
		fileHeader.Size,
	)
	if err != nil {
		brandUploadError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": brand})
}
