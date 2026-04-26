package controllers

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// dbTimeout is a soft per-request ceiling for any single MongoDB operation
// initiated from a Gin handler. CLAUDE.md mandates timeouts on all DB calls so
// a slow primary, network blip, or runaway query cannot pin a goroutine
// indefinitely. 5 seconds is a starting cap for OLTP-style reads/writes — tune
// downward if p99 stays well below this, or upward (per call site) only when a
// specific operation is known to be legitimately slow.
const dbTimeout = 5 * time.Second

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
