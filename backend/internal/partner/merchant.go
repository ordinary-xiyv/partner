package partner

import "time"

// Merchant is independent from the invitation-based lc_agents table.
// The site binding is changed only through the dedicated site endpoint.
type Merchant struct {
	ID                            int64      `json:"id" gorm:"primaryKey;column:id"`
	MerchantName                  string     `json:"merchant_name" gorm:"column:merchant_name"`
	MerchantCode                  string     `json:"merchant_code" gorm:"column:merchant_code"`
	SiteID                        *string    `json:"site_id" gorm:"column:site_id"`
	SiteDomain                    *string    `json:"site_domain" gorm:"column:site_domain"`
	SiteCredentialHash            []byte     `json:"-" gorm:"column:site_credential_hash"`
	SiteCredentialRotatedAt       *time.Time `json:"-" gorm:"column:site_credential_rotated_at"`
	SiteLastSeenAt                *time.Time `json:"site_last_seen_at" gorm:"column:site_last_seen_at"`
	PartnerPasswordHash           *string    `json:"-" gorm:"column:partner_password_hash"`
	PartnerLoginEnabled           bool       `json:"partner_login_enabled" gorm:"column:partner_login_enabled"`
	PartnerPasswordChangeRequired bool       `json:"-" gorm:"column:partner_password_change_required"`
	PartnerSessionVersion         int64      `json:"-" gorm:"column:partner_session_version"`
	CreatedAt                     time.Time  `json:"created_at" gorm:"column:created_at"`
	UpdatedAt                     time.Time  `json:"updated_at" gorm:"column:updated_at"`
}

func (Merchant) TableName() string { return "lc_distribution_merchants" }
