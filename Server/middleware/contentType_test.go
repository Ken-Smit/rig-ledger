package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// The gate must let the app's real traffic through and stop the "simple
// request" shape that skips a CORS preflight.
func TestRequireJSONContentType(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name        string
		method      string
		path        string
		contentType string
		body        string
		want        int
	}{
		{"json accepted", "POST", "/api/v1/expenses", "application/json", `{"a":1}`, http.StatusOK},
		{"json with charset", "POST", "/api/v1/expenses", "application/json; charset=utf-8", `{"a":1}`, http.StatusOK},
		{"json uppercase", "POST", "/api/v1/expenses", "Application/JSON", `{"a":1}`, http.StatusOK},
		{"text/plain rejected", "POST", "/api/v1/expenses", "text/plain", `{"a":1}`, http.StatusUnsupportedMediaType},
		{"form rejected", "POST", "/api/v1/expenses", "application/x-www-form-urlencoded", "a=1", http.StatusUnsupportedMediaType},
		{"multipart on scan ok", "POST", scanPath, "multipart/form-data; boundary=x", "x", http.StatusOK},
		{"multipart off scan rejected", "POST", "/api/v1/expenses", "multipart/form-data; boundary=x", "x", http.StatusUnsupportedMediaType},
		{"bodyless post allowed", "POST", "/api/v1/auth/logout", "", "", http.StatusOK},
		{"GET untouched", "GET", "/api/v1/expenses", "", "", http.StatusOK},
		{"PUT json accepted", "PUT", "/api/v1/trucks/1", "application/json", `{"a":1}`, http.StatusOK},
		{"PUT text rejected", "PUT", "/api/v1/trucks/1", "text/plain", `{"a":1}`, http.StatusUnsupportedMediaType},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(RequireJSONContentType())
			router.Any("/*any", func(c *gin.Context) { c.Status(http.StatusOK) })

			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.want {
				t.Errorf("got %d, want %d", rec.Code, tc.want)
			}
		})
	}
}
