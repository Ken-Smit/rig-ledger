package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	contentTypeJSON      = "application/json"
	contentTypeMultipart = "multipart/form-data"

	// scanPath is the one route that legitimately receives a file upload.
	// Every other body-bearing endpoint takes JSON.
	scanPath = "/api/v1/expenses/scan"
)

// RequireJSONContentType rejects body-bearing requests that do not declare a
// Content-Type this API actually accepts.
//
// SECURITY: a cross-origin POST with text/plain is a CORS "simple request" — it
// is sent WITHOUT a preflight, so the browser never asks permission before the
// request reaches us with the user's cookies attached. Our CORS middleware
// already rejects such a request on its Origin header; this is the second,
// independent lock on the same door. Content-Type is not a trust signal on its
// own, but requiring it collapses the set of request shapes that reach a handler.
//
// Requests with no body (Content-Length 0 and no declared type) are allowed:
// some clients issue logout/refresh as a bare POST.
func RequireJSONContentType() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch:
		default:
			c.Next()
			return
		}

		raw := c.GetHeader("Content-Type")
		if raw == "" && c.Request.ContentLength <= 0 {
			c.Next()
			return
		}

		// Strip parameters: "application/json; charset=utf-8" -> "application/json".
		mediaType := strings.ToLower(strings.TrimSpace(strings.Split(raw, ";")[0]))

		switch {
		case mediaType == contentTypeJSON:
		case mediaType == contentTypeMultipart && c.Request.URL.Path == scanPath:
		default:
			c.AbortWithStatusJSON(http.StatusUnsupportedMediaType,
				gin.H{"error": "Send this request as JSON"})
			return
		}
		c.Next()
	}
}
