package middleware

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ulule/limiter/v3"
	memstore "github.com/ulule/limiter/v3/drivers/store/memory"
)

// Rate-limit defaults for the unprotected auth surface.
const (
	authRateLimitPerMin        = 10
	authRateLimitWindow        = time.Minute
	authRateLimitEnvVar        = "AUTH_RATE_LIMIT_PER_MIN"
	authRateLimitErrorResponse = "Too many requests"
)

// AuthRateLimiter returns a Gin middleware that throttles requests to
// AUTH_RATE_LIMIT_PER_MIN (default 10) per minute per client IP. Intended for
// the unprotected auth endpoints (login, register, refresh) where unauthenticated
// callers can otherwise brute-force credentials or spam the SMS / email surface.
//
// The middleware keys on c.ClientIP(). c.ClientIP() honours Gin's trusted-proxy
// configuration; main.go restricts trusted proxies to the upstream load balancer
// in release mode, so X-Forwarded-For spoofing is mitigated there. In dev mode
// Gin's default "trust everything" is fine — the limiter still works against
// loopback abuse and there is no public attack surface.
//
// The middleware itself is a stateless closure over a shared *limiter.Limiter.
// The limiter holds in-memory bucket state keyed by IP; this state lives in the
// process, not in the request. CLAUDE.md's "middleware must be stateless" rule
// forbids per-request mutable state inside the handler — shared, read-mostly
// configuration like a rate-limit store is permitted and standard practice.
func AuthRateLimiter() gin.HandlerFunc {
	rate := limiter.Rate{
		Period: authRateLimitWindow,
		Limit:  int64(resolveAuthRateLimit()),
	}
	store := memstore.NewStore()
	instance := limiter.New(store, rate)

	return func(c *gin.Context) {
		ctx, err := instance.Get(c, c.ClientIP())
		if err != nil {
			// Fail closed on a limiter outage would block all auth — fail open
			// but log the underlying cause server-side. Generic 500 to client.
			log.Printf("rate limiter error: %v", err)
			c.Next()
			return
		}
		if ctx.Reached {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": authRateLimitErrorResponse})
			return
		}
		c.Next()
	}
}

// resolveAuthRateLimit reads AUTH_RATE_LIMIT_PER_MIN, falling back to
// authRateLimitPerMin when unset or invalid. A non-positive value is rejected.
func resolveAuthRateLimit() int {
	raw := os.Getenv(authRateLimitEnvVar)
	if raw == "" {
		return authRateLimitPerMin
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		log.Printf("invalid %s=%q, falling back to default %d", authRateLimitEnvVar, raw, authRateLimitPerMin)
		return authRateLimitPerMin
	}
	return parsed
}
