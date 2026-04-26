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

		userID, err := utils.ValidateAccessToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Set("userID", userID)
		c.Next()
	}
}
