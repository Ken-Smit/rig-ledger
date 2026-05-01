package utils

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// Cookie names and lifetimes are centralized so callers cannot drift.
const (
	accessCookieName   = "access_token"
	refreshCookieName  = "refresh_token"
	accessCookieMaxAge = 15 * 60          // 15 minutes
	refreshMaxAge      = 24 * 60 * 60     // 24 hours
	cookiePath         = "/"
)

func isProduction() bool {
	return os.Getenv("GIN_MODE") == "release"
}

func cookieSameSite() http.SameSite {
	if isProduction() {
		// Cross-site contexts (SPA on a different eTLD+1) require SameSite=None.
		// Combine with Secure + Partitioned to satisfy iOS Safari ITP / CHIPS.
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

// setAuthCookie writes an httpOnly auth cookie. In production it adds the
// Partitioned attribute so iOS Safari (and Chrome's third-party cookie
// phase-out) treat it as a CHIPS cookie keyed to the top-level site —
// required when the SPA and API live on different registrable domains.
//
// Same-site deployment (SPA at app.example.com, API at api.example.com)
// is the recommended topology because it sidesteps the third-party-cookie
// problem entirely; Partitioned is harmless in that case.
func setAuthCookie(c *gin.Context, name, value string, maxAge int) {
	prod := isProduction()
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     cookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   prod,
		SameSite: cookieSameSite(),
		// Partitioned is only meaningful (and only allowed) on Secure
		// SameSite=None cookies, which is exactly our production config.
		Partitioned: prod,
	}
	http.SetCookie(c.Writer, cookie)
}

// SetAccessTokenCookie persists the short-lived access JWT as an httpOnly cookie.
func SetAccessTokenCookie(c *gin.Context, token string) {
	setAuthCookie(c, accessCookieName, token, accessCookieMaxAge)
}

// SetRefreshTokenCookie persists the long-lived refresh JWT as an httpOnly cookie.
func SetRefreshTokenCookie(c *gin.Context, token string) {
	setAuthCookie(c, refreshCookieName, token, refreshMaxAge)
}

// ClearAuthCookies expires both auth cookies. MaxAge=-1 instructs the browser
// to delete the cookie immediately. Attributes must match the original Set
// call (Path, SameSite, Secure, Partitioned) or some browsers will ignore it.
func ClearAuthCookies(c *gin.Context) {
	setAuthCookie(c, accessCookieName, "", -1)
	setAuthCookie(c, refreshCookieName, "", -1)
}
