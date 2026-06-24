package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Defense-in-depth header values. Pulled into named constants so a future
// auditor sees intent, not magic strings.
const (
	headerNoSniff        = "nosniff"
	headerFrameDeny      = "DENY"
	headerReferrerPolicy = "strict-origin-when-cross-origin"

	// headerCSP locks down the API. This service only ever returns JSON — it
	// renders no HTML, loads no scripts, and must never be framed. A maximally
	// restrictive policy ("default-src 'none'", "frame-ancestors 'none'")
	// neutralizes clickjacking and any reflected-content vector at no cost to
	// a JSON API. The SPA host carries its own (looser) policy in render.yaml.
	headerCSP = "default-src 'none'; frame-ancestors 'none'"
	// HSTS: 2 years, include subdomains, ready for the preload list.
	// Only emitted in release mode — see SecurityHeaders.
	headerHSTSValue = "max-age=63072000; includeSubDomains; preload"

	// healthCheckPath is exempted from RequireHTTPS so the platform's
	// liveness probe (which may hit the service over HTTP internally) keeps
	// returning 200 without TLS.
	healthCheckPath = "/healthz"

	// forwardedProtoHTTPS is the value Render (and most reverse proxies)
	// forward via X-Forwarded-Proto when the upstream client used TLS.
	forwardedProtoHTTPS = "https"
)

// SecurityHeaders returns a Gin middleware that sets defense-in-depth
// response headers on every response. HSTS is only emitted in release
// mode because sending it over plaintext localhost breaks local dev
// (browsers will then refuse the http://localhost origin for two years).
//
// The middleware is a pure closure with no shared state, so it satisfies
// CLAUDE.md's "middleware must be stateless" rule.
func SecurityHeaders() gin.HandlerFunc {
	releaseMode := gin.Mode() == gin.ReleaseMode
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", headerNoSniff)
		c.Header("X-Frame-Options", headerFrameDeny)
		c.Header("Referrer-Policy", headerReferrerPolicy)
		c.Header("Content-Security-Policy", headerCSP)
		if releaseMode {
			c.Header("Strict-Transport-Security", headerHSTSValue)
		}
		c.Next()
	}
}

// RequireHTTPS returns a Gin middleware that rejects plaintext HTTP
// requests in release mode. Render terminates TLS upstream and forwards
// the original scheme via X-Forwarded-Proto, so we trust that header
// (router.SetTrustedProxies must be configured upstream of this middleware
// for ClientIP and friends to be safe; the proto check itself only needs
// the header to be present).
//
// /healthz is intentionally exempted so the platform health probe still
// answers without HTTPS in release mode.
//
// In non-release mode this middleware is a no-op so local dev over plain
// HTTP keeps working.
func RequireHTTPS() gin.HandlerFunc {
	releaseMode := gin.Mode() == gin.ReleaseMode
	return func(c *gin.Context) {
		if !releaseMode {
			c.Next()
			return
		}
		if c.Request.URL.Path == healthCheckPath {
			c.Next()
			return
		}
		if c.GetHeader("X-Forwarded-Proto") != forwardedProtoHTTPS {
			// Generic client-facing message; details stay server-side.
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "HTTPS required"})
			return
		}
		c.Next()
	}
}
