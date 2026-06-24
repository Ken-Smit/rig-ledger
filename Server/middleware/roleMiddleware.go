package middleware

import (
	"net/http"

	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
)

// RequireOwner gates a route to authenticated owners only.
//
// Contract: must run AFTER JWTAuthMiddleware in the handler chain, because it
// reads "userID" and "role" out of the gin.Context that the auth middleware
// populates. If "userID" is absent the request was never authenticated and we
// return 401 (the auth middleware was skipped or misordered — a 403 here would
// be misleading). If "role" is present but not "owner", we return 403 with a
// generic message; the client treats this as "drivers can't do that."
//
// SECURITY: comparison uses the models.RoleOwner constant. Any future role
// change (additions are deliberate, see userModel.go) must update the role
// constants and any allowlists; this middleware refuses to silently accept
// new role strings.
func RequireOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		// userID being unset means JWTAuthMiddleware did not run before this
		// handler — almost certainly a route-wiring bug. Surface as 401 so
		// the caller is steered to authenticate rather than told they lack
		// permission for a request that was never authorized in the first
		// place.
		if c.GetString("userID") == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}

		if c.GetString("role") != models.RoleOwner {
			c.JSON(http.StatusForbidden, gin.H{"error": "Owner access required"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireEntitled gates a route to fleets with an active subscription.
//
// Contract: must run AFTER JWTAuthMiddleware, which sets "entitled" on the
// context from the access token's claim. Entitlement is fleet-level — a driver
// inherits it from the owner's subscription via the shared fleet, so an invited
// driver has full access exactly when the owner is paying, and loses it when the
// owner lapses. The claim is re-evaluated on every token refresh (<=15 min), so
// a started/cancelled subscription propagates to the whole fleet within one
// refresh cycle.
//
// Returns 402 Payment Required (not 403): the block is about billing state, not
// permission, and the SPA keys on 402 to route the user to the billing page.
// The message is role-aware so a driver is told to ask their owner rather than
// shown a "subscribe" call-to-action they cannot act on.
//
// SECURITY: fail-safe. A token minted before this release (or any malformed
// claim) decodes to entitled=false, so the gate blocks rather than grants.
func RequireEntitled() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("userID") == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}

		if !c.GetBool("entitled") {
			msg := "This fleet needs an active subscription. Ask your fleet owner to subscribe."
			if c.GetString("role") == models.RoleOwner {
				msg = "Start your free trial or subscribe to continue."
			}
			c.JSON(http.StatusPaymentRequired, gin.H{"error": msg})
			c.Abort()
			return
		}

		c.Next()
	}
}
