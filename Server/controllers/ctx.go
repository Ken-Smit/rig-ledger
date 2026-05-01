package controllers

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// dbTimeout is a soft per-request ceiling for the SUM of MongoDB operations a
// single Gin handler may issue. CLAUDE.md mandates bounded DB calls so a slow
// primary, network blip, or runaway query cannot pin a goroutine indefinitely.
//
// 10s budget covers the worst case observed on Render free tier (0.5 CPU,
// cold Atlas connection): SRV resolve + TLS handshake + auth ≈ 3-5s on first
// request after idle, plus subsequent ops in the same handler. Tighten once
// the deploy moves off the free tier or a connection-prewarm is added.
const dbTimeout = 10 * time.Second

// dbCtx returns a context derived from the inbound request that is also bounded
// by dbTimeout. Callers MUST defer the returned cancel func to release the
// timer goroutine even on the happy path.
//
// Deriving from c.Request.Context() means the timeout is the *minimum* of the
// client disconnect signal and dbTimeout — whichever fires first wins, so we
// never keep doing work on behalf of a client that has already gone away.
func dbCtx(c *gin.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), dbTimeout)
}
