package routes

import (
	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/gin-gonic/gin"
)

// SetupProtectedRoutes adds all protected routes that require authentication and MongoDB connection
func SetupProtectedRoutes(router *gin.Engine) {
	protected := router.Group("/api/v1")
	protected.Use(middleware.JWTAuthMiddleware())
	{
		// Auth routes
		protected.POST("/auth/logout", controllers.Logout)

		// User routes
		protected.GET("/user/profile", controllers.GetUserProfile)
		protected.PUT("/user/profile", controllers.UpdateUserProfile)
		protected.DELETE("/user/profile", controllers.DeleteUser)

		// Truck routes
		protected.GET("/trucks", controllers.GetUserTrucks)
		protected.GET("/trucks/:id", controllers.GetTruck)
		protected.POST("/trucks", controllers.CreateTruck)
		protected.PUT("/trucks/:id", controllers.UpdateTruck)
		protected.DELETE("/trucks/:id", controllers.DeleteTruck)

		// Expense routes
		protected.GET("/expenses", controllers.GetExpenses)
		protected.POST("/expenses", controllers.CreateExpense)
		protected.DELETE("/expenses/:id", controllers.DeleteExpense)
	}
}
