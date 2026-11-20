package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPartnerUnauthenticatedResponse(t *testing.T) {
	t.Setenv("PARTNER_SESSION_SECRET", strings.Repeat("s", 40))
	r := buildRouter()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/partner/me", nil))
	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), "请登录伙伴后台") {
		t.Fatalf("unexpected: %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache header: %q", w.Header().Get("Cache-Control"))
	}
}
