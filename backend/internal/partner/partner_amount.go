package partner

const partnerQuotaPerCNY = 500_000

func partnerQuotaCNY(quota int64) float64 {
	return float64(quota) / partnerQuotaPerCNY
}
