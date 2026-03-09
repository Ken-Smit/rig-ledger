package utils

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func isProduction() bool {
	return os.Getenv("GIN_MODE") == "release"
}

func SetAccessTokenCookie(c *gin.Context, token string) {
	secure := isProduction()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", token, 900, "/api", "", secure, true)
}

func SetRefreshTokenCookie(c *gin.Context, token string) {
	secure := isProduction()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", token, 86400, "/api/v1/auth", "", secure, true)
}

func ClearAuthCookies(c *gin.Context) {
	secure := isProduction()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", "", -1, "/api", "", secure, true)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", "", -1, "/api/v1/auth", "", secure, true)
}
