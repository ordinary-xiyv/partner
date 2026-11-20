package common

import (
	"partner/internal/model"
	"strings"
	"sync"
	"time"
)

type publicNameEntry struct {
	name    string
	ok      bool
	expires time.Time
}

var publicNameCache sync.Map

// PublicNameForModelID preserves the catalog's direct/unique-alias display rules.
func PublicNameForModelID(modelID string) (string, bool) {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" || model.DB == nil {
		return "", false
	}
	if cached, found := publicNameCache.Load(modelID); found {
		entry := cached.(publicNameEntry)
		if time.Now().Before(entry.expires) {
			return entry.name, entry.ok
		}
	}
	name, ok := lookupPublicName(modelID)
	publicNameCache.Store(modelID, publicNameEntry{name: name, ok: ok, expires: time.Now().Add(time.Minute)})
	return name, ok
}
func lookupPublicName(modelID string) (string, bool) {
	var direct []struct {
		DisplayName string
		Kind        string
	}
	err := model.DB.Table("lc_model_catalog").Select("display_name, kind").
		Where("model_id = ? AND callable = ? AND display_name <> '' AND deleted_at IS NULL", modelID, true).
		Limit(1).Scan(&direct).Error
	if err == nil && len(direct) == 1 {
		name := strings.TrimSpace(direct[0].DisplayName)
		if name != "" && name != modelID {
			return name, true
		}
		if direct[0].Kind == "direct" || direct[0].Kind == "" {
			return "", false
		}
	}
	var aliases []struct{ DisplayName string }
	err = model.DB.Table("lc_model_alias_targets AS t").Select("lc.display_name AS display_name").
		Joins("JOIN lc_model_catalog AS lc ON lc.model_id = t.catalog_model_id").
		Where("t.target_model_id = ? AND t.enabled = ? AND t.deleted_at IS NULL AND lc.callable = ? AND lc.kind = ? AND lc.deleted_at IS NULL AND lc.display_name <> ''", modelID, true, true, "alias").
		Limit(2).Scan(&aliases).Error
	if err != nil || len(aliases) != 1 {
		return "", false
	}
	name := strings.TrimSpace(aliases[0].DisplayName)
	return name, name != "" && name != modelID
}
