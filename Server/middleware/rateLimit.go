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

// Rate-limit defaults for the AI receipt-scan surface. Each scan uploads up to
// 10 MB and triggers a billable Gemini vision call, so the ceiling protects
// both cost and the upstream quota. Keyed per authenticated user (not IP) so
// one abusive account cannot exhaust the budget for everyone behind a shared
// NAT / corporate egress IP.
const (
	scanRateLimitPerMin        = 20
	scanRateLimitWindow        = time.Minute
	scanRateLimitEnvVar        = "SCAN_RATE_LIMIT_PER_MIN"
	scanRateLimitErrorResponse = "You're scanning receipts too quickly. Wait a moment and try again."
	scanRateLimitKeyPrefix     = "scan:"
)

// ───────────────────────────────────────────────────────────────────────────
// IN-MEMORY STORE LIMITATION (M-1 / M-2)
//
// Both limiters below use ulule's in-process memory store. This has three
// consequences that MUST be understood before scaling:
//
//  1. Cold start / restart: bucket state lives in process memory only. A Render
//     cold start, redeploy, or crash wipes every bucket — counters reset to
//     zero. An attacker who can trigger restarts (or simply waits one out) gets
//     a fresh budget.
//
//  2. Horizontal scaling: the limit is enforced PER INSTANCE. Running N
//     replicas effectively multiplies the real-world limit by N, because each
//     replica keeps its own independent counters and the load balancer spreads
//     traffic across them.
//
//  3. Fail-open: on a store error the middleware logs and calls c.Next() rather
//     than blocking. This favours availability over strict enforcement.
//
// Before scaling beyond a single instance, swap memstore for a SHARED store
// (e.g. Redis via github.com/ulule/limiter/v3/drivers/store/redis) so all
// replicas share one counter and state survives restarts. No Redis code is
// added here — this is a documented, deliberate single-instance assumption.
// ───────────────────────────────────────────────────────────────────────────

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
	return resolveRateLimit(authRateLimitEnvVar, authRateLimitPerMin)
}

// ScanRateLimiter returns a Gin middleware that throttles AI receipt scans to
// SCAN_RATE_LIMIT_PER_MIN (default 20) per minute PER AUTHENTICATED USER.
//
// Unlike AuthRateLimiter (which keys on IP for unauthenticated callers), this
// limiter keys on the JWT subject — c.GetString("userID") — because the scan
// route is mounted behind JWTAuthMiddleware. It MUST run after that middleware
// so userID is populated. If userID is somehow empty (it should never be on a
// protected route) we fail open and log, rather than collapsing every caller
// into a single shared bucket.
//
// See the IN-MEMORY STORE LIMITATION block above for the shared-store caveat.
func ScanRateLimiter() gin.HandlerFunc {
	rate := limiter.Rate{
		Period: scanRateLimitWindow,
		Limit:  int64(resolveRateLimit(scanRateLimitEnvVar, scanRateLimitPerMin)),
	}
	store := memstore.NewStore()
	instance := limiter.New(store, rate)

	return func(c *gin.Context) {
		userID := c.GetString("userID")
		if userID == "" {
			// A protected route with no userID is a wiring bug, not a client
			// error. Fail open + log so the scanner stays usable while the
			// misconfiguration surfaces in server logs.
			log.Printf("ScanRateLimiter: empty userID on protected route %s; skipping limit", c.FullPath())
			c.Next()
			return
		}
		ctx, err := instance.Get(c, scanRateLimitKeyPrefix+userID)
		if err != nil {
			log.Printf("scan rate limiter error: %v", err)
			c.Next()
			return
		}
		if ctx.Reached {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": scanRateLimitErrorResponse})
			return
		}
		c.Next()
	}
}

// resolveRateLimit reads envVar as a positive int, falling back to def when the
// variable is unset or invalid. Shared by the auth and scan limiters so the
// parse + validation + logging behaviour stays identical (DRY).
func resolveRateLimit(envVar string, def int) int {
	raw := os.Getenv(envVar)
	if raw == "" {
		return def
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		log.Printf("invalid %s=%q, falling back to default %d", envVar, raw, def)
		return def
	}
	return parsed
}
