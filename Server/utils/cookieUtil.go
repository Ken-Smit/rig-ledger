package utils

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func isProduction() bool {
	return os.Getenv("GIN_MODE") == "release"
}

func cookieSameSite() http.SameSite {
	return http.SameSiteLaxMode
}

func SetAccessTokenCookie(c *gin.Context, token string) {
	secure := isProduction()
	c.SetSameSite(cookieSameSite())
	c.SetCookie("access_token", token, 900, "/", "", secure, true)
}

func SetRefreshTokenCookie(c *gin.Context, token string) {
	secure := isProduction()
	c.SetSameSite(cookieSameSite())
	c.SetCookie("refresh_token", token, 86400, "/", "", secure, true)
}

func ClearAuthCookies(c *gin.Context) {
	secure := isProduction()
	c.SetSameSite(cookieSameSite())
	c.SetCookie("access_token", "", -1, "/", "", secure, true)
	c.SetSameSite(cookieSameSite())
	c.SetCookie("refresh_token", "", -1, "/", "", secure, true)
}
