package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"

	"partner/internal/model"
)

/*
deleteObjectByURL 通过公网地址反推对象键并删除。

只给测试用：真实上传的测试会在 bucket 里留一个文件，必须能清掉，
但要删就得先知道对象键，而对象键只有后端当时生成的那一份。
从公开 URL 里切出「域名之后的部分」是最直接的还原方式，
也顺带验证了「存的 URL 确实指向这个 bucket」这件事。
*/
func deleteObjectByURL(publicURL string) error {
	const scheme = "https://"
	if !strings.HasPrefix(publicURL, scheme) {
		return fmt.Errorf("地址格式不认识：%s", publicURL)
	}
	rest := strings.TrimPrefix(publicURL, scheme)
	slash := strings.IndexByte(rest, '/')
	if slash < 0 {
		return fmt.Errorf("地址里没有对象键：%s", publicURL)
	}
	host, objectKey := rest[:slash], rest[slash+1:]
	if objectKey == "" {
		return fmt.Errorf("对象键为空：%s", publicURL)
	}
	bucket := host
	if dot := strings.IndexByte(host, '.'); dot > 0 {
		bucket = host[:dot]
	}

	var rows []struct {
		Key   string `gorm:"column:key"`
		Value string `gorm:"column:value"`
	}
	/*
	 * 必须显式 Table("options")。
	 *
	 * 匿名结构体没有 TableName()，GORM 会按类型名猜表名，猜不出来时
	 * 生成的是 `SELECT * FROM "` —— 一个语法都不完整的 SQL，
	 * 表现是「清理失败但错误信息看不懂」。用具名类型也行，但这里只读两列，
	 * 显式指定表名比多定义一个类型更直接。
	 */
	if err := model.DB.Table("options").Find(&rows).Error; err != nil {
		return err
	}
	values := make(map[string]string, len(rows))
	for _, row := range rows {
		if !strings.HasPrefix(row.Key, "object_storage_setting.") {
			continue
		}
		values[strings.TrimPrefix(row.Key, "object_storage_setting.")] = row.Value
	}
	endpoint := strings.TrimSpace(values["endpoint"])
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	endpoint = strings.TrimSuffix(endpoint, "/")
	region := strings.TrimSpace(values["region"])
	if region == "" {
		region = "cn-beijing"
	}
	client, err := tos.NewClientV2(endpoint,
		tos.WithRegion(region),
		tos.WithCredentials(tos.NewStaticCredentials(
			strings.TrimSpace(values["access_key_id"]),
			strings.TrimSpace(values["access_key_secret"]),
		)),
	)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err = client.DeleteObjectV2(ctx, &tos.DeleteObjectV2Input{Bucket: bucket, Key: objectKey})
	return err
}
