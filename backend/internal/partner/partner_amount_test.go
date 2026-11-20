package partner

import "testing"

func TestPartnerQuotaCNYUsesFixedFiveHundredThousandRate(t *testing.T) {
	for _, tc := range []struct {
		quota int64
		want  float64
	}{
		{0, 0},
		{500_000, 1},
		{250_000, 0.5},
		{-500_000, -1},
	} {
		if got := partnerQuotaCNY(tc.quota); got != tc.want {
			t.Fatalf("quota %d: got %v yuan, want %v", tc.quota, got, tc.want)
		}
	}
}
