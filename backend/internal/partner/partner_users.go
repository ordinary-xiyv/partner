package partner

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"partner/internal/common"
	"partner/internal/model"
)

type PartnerUser struct {
	ID          int64      `json:"id" gorm:"column:id"`
	Username    string     `json:"username" gorm:"column:username"`
	DisplayName string     `json:"display_name" gorm:"column:display_name"`
	Email       string     `json:"email" gorm:"column:email"`
	Phone       *string    `json:"phone,omitempty" gorm:"column:phone"`
	Status      int        `json:"status" gorm:"column:status"`
	CreatedTime *time.Time `json:"created_time,omitempty" gorm:"column:created_time"`

	/*
	 * ↓ 本月用量。随列表一起从 logs 聚合，不再是前端二次请求合并的。
	 *
	 * 用指针是为了保住「没有数据」和「消耗为 0」的区别：
	 * 本月一条日志都没有的客户，聚合列是 NULL，omitempty 会把这个键整个省掉，
	 * 前端据此显示「—」。如果这里 COALESCE 成 0，界面就会把一个从没调用过的
	 * 客户显示成「这个月花了 ¥0.0000」，读起来像是他消费过但金额为零。
	 */
	UsedQuota     *int64   `json:"used_quota,omitempty" gorm:"column:used_quota"`
	RequestCount  *int64   `json:"request_count,omitempty" gorm:"column:request_count"`
	UsedAmountCNY *float64 `json:"used_amount_cny,omitempty" gorm:"-"`
}

type PartnerUserPage struct {
	Items    []PartnerUser `json:"items"`
	Total    int64         `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

func maskPartnerPhone(phone *string) *string {
	if phone == nil {
		return nil
	}
	value := []rune(*phone)
	if len(value) < 8 {
		masked := "****"
		return &masked
	}
	masked := string(value[:3]) + "****" + string(value[len(value)-4:])
	return &masked
}

/*
 * users.status 的取值，与 lynxtonapi 的 upstream/common/constants.go 一致：
 *   1 = 启用，2 = 禁用（没有 0，0 是 Go 的零值，主站明确要求不用）
 *
 * 伙伴后端不引入主站的 common 包（那是另一个模块），所以这里直接用数字。
 * 改这两个值必须同时改主站，否则状态会显示反。
 */
const (
	partnerUserStatusEnabled  = 1
	partnerUserStatusDisabled = 2
)

/*
 * 状态筛选的合法值。0 表示「全部」，不参与过滤。
 *
 * 为什么用 0 当「全部」而不是 -1 或空串：
 *   前端 Segmented 的「全部」值就是 0，契约直接对上，两边不需要各自转换。
 */
func validPartnerUserStatus(status int) bool {
	return status == 0 || status == partnerUserStatusEnabled || status == partnerUserStatusDisabled
}

/*
 * 可排序列白名单。
 *
 * ★ 必须白名单，不能把前端传来的字符串拼进 ORDER BY —— 那是注入。
 * 也正因为要白名单，前端传的键名和后端列名是两套，必须在这里显式映射。
 *
 * amount_cny 不单独占一列：它与 quota 是同一个数乘固定汇率
 * （partnerQuotaCNY = quota / 500000），排序结果完全一致，
 * 所以 used_amount_cny 直接映射到 used_quota，少一个聚合列。
 *
 * ★ 用量三列指向的是 Select 里的**输出别名**。两条路径（标量子查询 /
 *   派生表 JOIN）都会把聚合列命名为 used_quota / request_count 输出，
 *   所以 ORDER BY 统一写别名，两种形态通用。
 */
var partnerUserSortColumns = map[string]string{
	"id":              "users.id",
	"created_at":      "users.created_time",
	"used_quota":      "used_quota",
	"used_amount_cny": "used_quota",
	"request_count":   "request_count",
}

/*
 * 按用量排序时，客户数不超过该阈值仍走标量相关子查询，超过才切派生表聚合。
 *
 * 两种成本的交叉点：标量路径按用量排序时每个客户执行一次子查询（无法 LIMIT
 * 下推），客户少时总耗时毫秒级，且完全不用扫区间日志；派生表路径固定要扫
 * 一遍区间日志（大商户更快，小商户反而亏）。20 是两条成本曲线的交叉量级。
 */
const partnerUserSortScalarMaxUsers = 20

/*
 * 需要用量聚合才能排的列。
 *
 * 这几列在 users 表里不存在，只能靠 logs 聚合出来，所以一旦选了它们，
 * 就必须真的把聚合算进来 —— 否则 ORDER BY 会指向一个不存在的别名。
 */
var partnerUserUsageSortColumns = map[string]bool{
	"used_quota":      true,
	"used_amount_cny": true,
	"request_count":   true,
}

// PartnerUserQuery 是客户列表的入参。
//
// 为什么用结构体而不是继续加位置参数：可排序列会越加越多，
// 再往后就是 7、8 个 string/int 排在一起，调用点写错了编译器也不报错。
type PartnerUserQuery struct {
	MerchantID int64
	Keyword    string
	// status: 0=全部，1=启用，2=禁用
	Status   int
	Page     int
	PageSize int
	// Sort 见 partnerUserSortColumns；空或非法一律回落 id
	Sort string
	// Order 只认 asc / desc，其余按 desc
	Order string
	// StartDate / EndDate 是用量统计区间（YYYY-MM-DD），空则取本月
	StartDate string
	EndDate   string
}

// ListPartnerUsers 保留旧签名，等价于「按 id 倒序、本月用量」。
//
// 老测试和内部调用都走这个入口，新增能力一律通过 ListPartnerUsersWith 传。
func ListPartnerUsers(
	merchantID int64,
	keyword string,
	status int,
	page, pageSize int,
) (PartnerUserPage, error) {
	return ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: merchantID,
		Keyword:    keyword,
		Status:     status,
		Page:       page,
		PageSize:   pageSize,
	})
}

/*
 * ★ 全库排序而不是页内排序 —— 这是这个函数存在的唯一理由。
 *
 * 之前表格的三个用量列用的是 antd 的 sorter 比较函数，只能排当前页那 10 条。
 * 翻到第 2 页又是一批全新的数据各自排一遍，用户永远排不出「全站消耗最高的客户」。
 *
 * 现在 ORDER BY 和 LIMIT/OFFSET 在同一个 SQL 里：先对全量结果集排序，
 * 再切分页，切出来的才是真正的第 N 页。
 */
func ListPartnerUsersWith(q PartnerUserQuery) (PartnerUserPage, error) {
	if q.MerchantID <= 0 {
		return PartnerUserPage{}, errors.New("invalid merchant ID")
	}
	page, pageSize := q.Page, q.PageSize
	keyword, status := q.Keyword, q.Status
	if page < 1 {
		page = 1
	}
	if page > 1000000 {
		page = 1000000
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	keyword = strings.TrimSpace(keyword)
	if len([]rune(keyword)) > 100 {
		keyword = string([]rune(keyword)[:100])
	}

	sortKey := strings.ToLower(strings.TrimSpace(q.Sort))
	sortColumn, ok := partnerUserSortColumns[sortKey]
	if !ok {
		sortKey = "id"
		sortColumn = partnerUserSortColumns["id"]
	}
	order := strings.ToLower(strings.TrimSpace(q.Order))
	if order != "asc" {
		order = "desc"
	}

	result := PartnerUserPage{Items: make([]PartnerUser, 0), Page: page, PageSize: pageSize}
	query := model.DB.Table("users").Where("merchant_id = ? AND deleted_at IS NULL AND role IN ?", q.MerchantID,
		[]int{common.RoleGuestUser, common.RoleCommonUser})
	if keyword != "" {
		like := "%" + strings.ToLower(keyword) + "%"
		id, err := strconv.ParseInt(keyword, 10, 64)
		if err != nil {
			id = -1
		}
		query = query.Where("(id = ? OR LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)",
			id, like, like, like, "%"+keyword+"%")
	}
	/*
	 * ★ 状态过滤必须加在 Count() 之前。
	 *
	 * Count 和 Find 共用同一个 query 对象，GORM 会把 Where 累积下来。
	 * 如果只在 Find 上加条件，total 还是未过滤的全量 —— 那正是这个 bug
	 * 原来的样子：表格筛出 2 条，上面写「共 137 个」，两个数字互相矛盾。
	 */
	if status != 0 {
		query = query.Where("status = ?", status)
	}

	/*
	 * ★ 用量聚合有两套形态，按场景二选一 —— 这是线上两次翻车换来的取舍。
	 *
	 * 形态一：标量相关子查询（每行 users 做一次 user_id 索引查找）。
	 *   - 默认视图（按 id / 开户时间排）时 LIMIT 会下推，子查询只对当前页
	 *     那 10 行执行。3000 个客户的大商户实测 0.28 ms，客户数涨不影响。
	 *   - 但按用量排序时必须先算出全部客户的用量才能 ORDER BY，无法下推：
	 *     子查询执行次数 = 客户数。627 客户 × 本月 1500 万行日志，线上实测
	 *     41~60 秒（网关超时）—— 这就是本次要修的故障。
	 *
	 * 形态二：派生表聚合（logs 按区间 GROUP BY 一次，再 JOIN 回 users）。
	 *   - 按用量排序只扫一遍本商户在区间内的日志，耗时与客户数无关：
	 *     1500 万行实测 630 ms（热缓存）。
	 *   - 代价是无论如何都要扫区间日志：一个只有 1 个客户的小商户也会从
	 *     27 ms 变成秒级 —— 那正是上一轮修掉的 3.8 秒故障，不能倒退。
	 *
	 * 所以用 result.Total（Count 反正要算，零成本）分流：
	 *   客户数 ≤ partnerUserSortScalarMaxUsers → 标量子查询（loops ≤ 20，毫秒级）
	 *   客户数 > 20 且按用量排序              → 派生表聚合（扫一遍区间日志）
	 *   客户数 > 20 但默认排序                → 标量子查询（LIMIT 下推只算 10 行）
	 *
	 * 两种形态的计费口径完全一致：消费(2) + 预扣(7) + 补扣(8) − 退款(6)，
	 * request_count 只数消费(2) 和预扣(7)，与 QueryPartnerBillingSummary 同口径，
	 * 由 partner_users_usage_scope_test.go（sqlite 双路径一致性）和
	 * partner_users_perf_realdb_test.go（真实库逐行比对）共同守护。
	 *
	 * 不做成「把 billing 换到 SQL 里做」的原因：billing 那个接口按 quota DESC
	 * 只给前 100 条（它自己是分页的），所以用它做排序数据源天生缺尾部数据。
	 * 聚合写进这条查询后没有 100 条上限，全量都能参与排序。
	 */
	usageJoined := false
	needUsageSort := partnerUserUsageSortColumns[sortKey]
	// 两个用量表达式在下面按区间拼好，Select 和 ORDER BY 共用同一份 ——
	// 排序键必须指回 Select 里的别名，不能让两处各写一遍 SQL 片段。
	var usageUsedQuota, usageRequestCount string
	var usageLo, usageHi int64
	if model.LOG_DB != nil && model.DB != nil && model.LOG_DB == model.DB {
		start, end, err := partnerBillingDates(q.StartDate, q.EndDate, time.Now())
		if err != nil {
			return PartnerUserPage{}, err
		}
		usageLo, usageHi = start.Unix(), end.AddDate(0, 0, 1).Unix()
		usageJoined = true
		usageUsedQuota = fmt.Sprintf(`(
			SELECT SUM(CASE WHEN type IN (%d, %d, %d) THEN quota WHEN type = %d THEN -quota ELSE 0 END)
			FROM logs
			WHERE logs.user_id = users.id AND created_at >= %d AND created_at < %d
		)`, model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge,
			model.LogTypeRefund, usageLo, usageHi)
		usageRequestCount = fmt.Sprintf(`(
			SELECT SUM(CASE WHEN type IN (%d, %d) THEN 1 ELSE 0 END)
			FROM logs
			WHERE logs.user_id = users.id AND created_at >= %d AND created_at < %d
		)`, model.LogTypeConsume, model.LogTypePreConsume, usageLo, usageHi)
	}
	/*
	 * 库是分开的（logs 和 users 不在同一个库）就聚合不了。
	 *
	 * 这时按用量排序无法做到全库准确，宁可返回明确错误，也不要悄悄退回 id 排序
	 * —— 那会让用户以为「按消耗排好了」，看到的却是开户时间顺序。
	 * 与 billing 接口在这种情况下返回 503 是同一个判断。
	 */
	if needUsageSort && !usageJoined {
		return PartnerUserPage{}, errPartnerBillingSeparateDB
	}

	if err := query.Count(&result.Total).Error; err != nil {
		return PartnerUserPage{}, err
	}

	// 路径分流，依据见上面的形态取舍说明。
	sortViaDerived := needUsageSort && result.Total > partnerUserSortScalarMaxUsers

	switch {
	case sortViaDerived:
		/*
		 * 派生表聚合：logs 按区间 GROUP BY 一次。
		 *
		 * ★ 子查询里必须带商户的 user_id 范围（IN 本商户客户集合），
		 *   否则聚合的是全平台日志 —— 小商户也要替全平台买单，那就是
		 *   上一轮修掉的 3.8 秒故障复发。
		 */
		merchantUsers := model.DB.Table("users").
			Select("id").
			Where("merchant_id = ? AND deleted_at IS NULL AND role IN ?", q.MerchantID,
				[]int{common.RoleGuestUser, common.RoleCommonUser})
		usageSub := model.LOG_DB.Table("logs").
			Select(`user_id,
				SUM(CASE WHEN type IN (?, ?, ?) THEN quota WHEN type = ? THEN -quota ELSE 0 END) AS used_quota,
				SUM(CASE WHEN type IN (?, ?) THEN 1 ELSE 0 END) AS request_count`,
				model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund,
				model.LogTypeConsume, model.LogTypePreConsume).
			Where("created_at >= ? AND created_at < ?", usageLo, usageHi).
			Where("user_id IN (?)", merchantUsers).
			Group("user_id")
		query = query.Joins("LEFT JOIN (?) AS usage ON usage.user_id = users.id", usageSub)
		query = query.Select(`users.id, users.username, users.display_name, users.email, users.phone,
			users.status, users.created_time,
			usage.used_quota AS used_quota, usage.request_count AS request_count`)
	case usageJoined:
		query = query.Select(`users.id, users.username, users.display_name, users.email, users.phone,
			users.status, users.created_time,
			` + usageUsedQuota + ` AS used_quota,
			` + usageRequestCount + ` AS request_count`)
	default:
		query = query.Select("id, username, display_name, email, phone, status, created_time")
	}

	/*
	 * ★ NULLS LAST 两个方向都要。
	 *
	 * 本月没产生日志的客户，聚合列是 NULL。Postgres 默认 DESC 会把 NULL 排在最前，
	 * 于是「按消耗从高到低」的头几行全是「—」，看着像排序坏了。
	 *
	 * ASC 方向也不让它冒头：NULL 不是「消耗为 0」，而是「没有可比数据」，
	 * 拿它去占「最低消耗」的位置同样误导。两个方向一律沉底。
	 *
	 * 次级排序固定 users.id，保证翻页稳定 —— 用量相同的行如果顺序游移，
	 * 第 1 页和第 2 页会出现重复或缺漏。
	 */
	orderBy := sortColumn + " " + strings.ToUpper(order)
	if needUsageSort {
		orderBy += " NULLS LAST"
	}
	orderBy += ", users.id DESC"

	if err := query.Order(orderBy).Limit(pageSize).Offset((page - 1) * pageSize).
		Find(&result.Items).Error; err != nil {
		return PartnerUserPage{}, err
	}
	for i := range result.Items {
		result.Items[i].Phone = maskPartnerPhone(result.Items[i].Phone)
		if result.Items[i].UsedQuota != nil {
			amount := partnerQuotaCNY(*result.Items[i].UsedQuota)
			result.Items[i].UsedAmountCNY = &amount
		}
	}
	return result, nil
}

// PartnerUsersAPI GET /api/partner/users?keyword=&status=&page=&page_size=&sort=&order=&start_date=&end_date=
func PartnerUsersAPI(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	merchantID := c.GetInt64("partner_merchant_id")
	if merchantID <= 0 {
		partnerError(c, http.StatusUnauthorized, "请登录伙伴后台")
		return
	}
	/*
	 * status 缺省是 0（全部）。
	 *
	 * 非法值返回 400 而不是静默忽略：前端如果拼错了参数，静默按「全部」
	 * 处理会让它以为筛选生效了，实际上看到的是全量 —— 又是「看起来对、
	 * 数字是错的」，跟这个接口原来的毛病一个性质。
	 */
	status, err := strconv.Atoi(c.DefaultQuery("status", "0"))
	if err != nil || !validPartnerUserStatus(status) {
		partnerError(c, http.StatusBadRequest, "状态参数无效")
		return
	}
	/*
	 * sort / order 非法值一律静默回落，不像 status 那样报 400。
	 *
	 * 理由不同：status 拼错会让数字算错（筛选没生效但界面像生效了），
	 * 而 sort 拼错最坏只是按 id 排序，界面上的箭头本来就由前端自己控制，
	 * 不会出现「界面说按消耗排、实际按 id 排」这种自相矛盾的显示。
	 * 为它挡住整个列表反而更糟。
	 */
	sortKey := strings.ToLower(strings.TrimSpace(c.Query("sort")))
	if _, ok := partnerUserSortColumns[sortKey]; !ok {
		sortKey = ""
	}
	order := strings.ToLower(strings.TrimSpace(c.Query("order")))
	if order != "asc" && order != "desc" {
		order = ""
	}
	result, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: merchantID,
		Keyword:    c.Query("keyword"),
		Status:     status,
		Page:       page,
		PageSize:   pageSize,
		Sort:       sortKey,
		Order:      order,
		StartDate:  c.Query("start_date"),
		EndDate:    c.Query("end_date"),
	})
	if err != nil {
		if errors.Is(err, errPartnerBillingSeparateDB) {
			partnerError(c, http.StatusServiceUnavailable, "按用量排序暂不可用")
			return
		}
		if errors.Is(err, errInvalidPartnerBillingRange) {
			partnerError(c, http.StatusBadRequest, err.Error())
			return
		}
		partnerError(c, http.StatusInternalServerError, "查询用户失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
