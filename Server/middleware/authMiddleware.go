package middleware

import (
	"net/http"
	"strings"

	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
)

// bearerPrefix is the RFC 6750 Authorization scheme prefix. Matched
// case-insensitively below — some HTTP clients lowercase scheme names.
const bearerPrefix = "Bearer "

// JWTAuthMiddleware validates the access token from the Authorization header
// or the httpOnly access_token cookie and attaches the user ID to the context.
//
// Header parsing is case-insensitive on the scheme ("Bearer", "bearer",
// "BEARER" all accepted) and bounds-checked so a header equal to the prefix
// length cannot panic on slice. If neither source supplies a token, or the
// token fails validation, the middleware writes a 401 and aborts.
func JWTAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// Check Authorization header first (Bearer token).
		auth := c.GetHeader("Authorization")
		if len(auth) > len(bearerPrefix) && strings.EqualFold(auth[:len(bearerPrefix)], bearerPrefix) {
			tokenString = auth[len(bearerPrefix):]
		}

		// Fall back to httpOnly cookie.
		if tokenString == "" {
			tokenString, _ = c.Cookie("access_token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}

		userID, role, fleetID, err := utils.ValidateAccessToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// A valid token must carry both a subject and a fleet. A blank in
		// either is a malformed or forged token: reject here so every
		// downstream handler can trust these keys without re-checking.
		if userID == "" || fleetID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}

		// Downstream handlers and the RequireOwner gate read these three keys
		// directly from the context. Setting all three here means no handler
		// has to redecode the token or hit the DB just to authorize.
		c.Set("userID", userID)
		c.Set("role", role)
		c.Set("fleetID", fleetID)
		c.Next()
	}
}
