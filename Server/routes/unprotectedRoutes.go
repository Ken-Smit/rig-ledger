package routes

import (
	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/gin-gonic/gin"
)

// SetupRoutes adds all unprotected routes that don't require authentication.
//
// Auth endpoints sit behind AuthRateLimiter to throttle credential-stuffing,
// brute-force, and invite-token-guessing attempts. Any new auth-shaped or
// invite-shaped endpoint MUST be added behind the rate limiter so an
// attacker cannot pivot to an unthrottled surface.
func SetupRoutes(router *gin.Engine) {
	api := router.Group("/api/v1")
	{
		authGroup := api.Group("/auth")
		authGroup.Use(middleware.AuthRateLimiter())
		{
			authGroup.POST("/register", controllers.Register)
			authGroup.POST("/register-driver", controllers.RegisterDriver)
			authGroup.POST("/login", controllers.Login)
			authGroup.POST("/refresh", controllers.RefreshAccessToken)

			// Email verification + password reset. Unauthenticated by design
			// (the user has no session yet) and rate-limited under the same
			// policy to throttle token guessing and email-spam abuse.
			authGroup.POST("/verify-email", controllers.VerifyEmail)
			authGroup.POST("/resend-verification", controllers.ResendVerification)
			authGroup.POST("/forgot-password", controllers.ForgotPassword)
			authGroup.POST("/reset-password", controllers.ResetPassword)
		}

		// Stripe webhook — unauthenticated by design (Stripe calls it directly)
		// and deliberately NOT rate-limited: throttling would drop legitimate
		// retried events and desync subscription state. Authenticity is enforced
		// inside the handler via Stripe signature verification against the raw
		// request body, which is strictly stronger than any IP throttle here.
		api.POST("/billing/webhook", controllers.HandleStripeWebhook)

		// Invite lookup is unauthenticated by design: the recipient is not yet
		// a Rig Ledger user when they click the invite link. Rate-limited under
		// the same policy as the auth surface to throttle token-guessing.
		inviteGroup := api.Group("/invites")
		inviteGroup.Use(middleware.AuthRateLimiter())
		{
			inviteGroup.GET("/lookup", controllers.LookupInvite)
		}
	}
}
