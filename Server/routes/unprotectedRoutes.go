package routes

import (
	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/gin-gonic/gin"
)

// SetupRoutes adds all unprotected routes that don't require authentication.
//
// Auth endpoints sit behind AuthRateLimiter to throttle credential-stuffing and
// brute-force attempts. Any new auth-shaped endpoint MUST be added inside the
// authGroup below so it inherits the rate limit.
func SetupRoutes(router *gin.Engine) {
	api := router.Group("/api/v1")
	{
		authGroup := api.Group("/auth")
		authGroup.Use(middleware.AuthRateLimiter())
		{
			authGroup.POST("/register", controllers.Register)
			authGroup.POST("/login", controllers.Login)
			authGroup.POST("/refresh", controllers.RefreshAccessToken)
		}
	}
}
