package controllers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
)

const (
	testUserID  = "64b000000000000000000001"
	testFleetID = "64b000000000000000000002"
)

func TestIsFleetEntitled(t *testing.T) {
	cases := []struct {
		name  string
		fleet models.Fleet
		want  bool
	}{
		{"no subscription", models.Fleet{}, false},
		{"trialing", models.Fleet{SubscriptionStatus: "trialing"}, true},
		{"active", models.Fleet{SubscriptionStatus: "active"}, true},
		{"canceled", models.Fleet{SubscriptionStatus: "canceled"}, false},
		{"promo only", models.Fleet{PromoBonusTrucks: 1}, true},
	}
	for _, tc := range cases {
		if got := isFleetEntitled(&tc.fleet); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

// Reproduces the post-Checkout billing redirect loop: a token minted before the
// subscription started is blocked (402), and the cookie written by
// remintAccessToken unblocks the very next request.
func TestRemintAccessTokenUnblocksGatedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("JWT_SECRET", "test-secret-test-secret-test-secret-12")

	router := gin.New()
	auth := router.Group("", middleware.JWTAuthMiddleware())
	// Stand-in for GetSubscription after the fleet flips to trialing.
	auth.GET("/sync", func(c *gin.Context) { remintAccessToken(c, c.GetString("fleetID"), true) })
	auth.GET("/trucks", middleware.RequireEntitled(), func(c *gin.Context) { c.Status(http.StatusOK) })

	do := func(path string, cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.AddCookie(cookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	stale, err := utils.GenerateAccessToken(testUserID, models.RoleOwner, testFleetID, false)
	if err != nil {
		t.Fatal(err)
	}
	staleCookie := &http.Cookie{Name: "access_token", Value: stale}

	if w := do("/trucks", staleCookie); w.Code != http.StatusPaymentRequired {
		t.Fatalf("stale token: got %d, want 402", w.Code)
	}

	var fresh *http.Cookie
	for _, ck := range do("/sync", staleCookie).Result().Cookies() {
		if ck.Name == "access_token" {
			fresh = ck
		}
	}
	if fresh == nil || fresh.Value == "" {
		t.Fatal("remintAccessToken did not set access_token cookie")
	}
	if !fresh.HttpOnly {
		t.Error("reminted cookie must be httpOnly")
	}

	if w := do("/trucks", fresh); w.Code != http.StatusOK {
		t.Fatalf("reminted token: got %d, want 200", w.Code)
	}
}
