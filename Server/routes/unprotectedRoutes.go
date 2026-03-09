package routes

import (
	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/gin-gonic/gin"
)

// SetupRoutes adds all unprotected routes that don't require authentication
func SetupRoutes(router *gin.Engine) {
	api := router.Group("/api/v1")
	{
		// Authentication routes
		api.POST("/auth/register", controllers.Register)
		api.POST("/auth/login", controllers.Login)
		api.POST("/auth/refresh", controllers.RefreshAccessToken)
	}
}
