package common

import "golang.org/x/crypto/bcrypt"

const (
	RoleGuestUser  = 0
	RoleCommonUser = 1
	QuotaPerUnit   = 500000.0
)

// SessionSecret is used only to read sessions created before the service split.
var SessionSecret string

func ValidatePasswordAndHash(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// The main app's public model-name mapping is not available in the partner service.
// Logs retain the stored model name until a shared mapping source is introduced.
var PublicModelNameMapper func(string) (string, bool)

func Password2Hash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}
