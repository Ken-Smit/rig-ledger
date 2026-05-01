package routes

import (
	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/gin-gonic/gin"
)

// SetupProtectedRoutes mounts every authenticated route under /api/v1.
//
// The route table has two tiers:
//
//  1. Any authenticated role (owner OR driver). Profile, logout, read-only
//     fleet roster, and mileage logging are accessible here. Drivers must be
//     able to log mileage and read the trucks they drive; the controller
//     filters by fleet_id so cross-fleet access is impossible regardless of
//     role.
//
//  2. Owner-only (nested under the authenticated tier with RequireOwner).
//     Truck mutations, expense management, and invite administration are
//     restricted to the fleet's owner. RequireOwner reads "role" from the
//     JWT context — it MUST run after JWTAuthMiddleware, which is why the
//     owner-only group is nested inside the authenticated group.
//
// SECURITY: every mutation handler still pulls fleetID from the JWT context
// and filters by it. Route-layer gating + controller-layer scoping is
// defense in depth — a misconfigured route table cannot expose another
// tenant's data because the controller would still 401 on an empty fleetID.
func SetupProtectedRoutes(router *gin.Engine) {
	protected := router.Group("/api/v1")
	protected.Use(middleware.JWTAuthMiddleware())
	{
		// Any authenticated role (owner OR driver).
		protected.POST("/auth/logout", controllers.Logout)

		protected.GET("/user/profile", controllers.GetUserProfile)
		protected.PUT("/user/profile", controllers.UpdateUserProfile)
		protected.DELETE("/user/profile", controllers.DeleteUser)

		protected.GET("/trucks", controllers.GetUserTrucks)
		protected.GET("/trucks/:id", controllers.GetTruck)

		protected.GET("/mileage-logs", controllers.GetMileageLogs)
		protected.POST("/mileage-logs", controllers.UpsertMileageLog)

		// Loads — driver tier. Literal /loads/mine paths registered before
		// /loads/:id (in the owner group) so the radix tree resolves the literal
		// path without colliding with the param route. TransitionLoad lives here
		// (not owner-only) because both drivers and owners legitimately call it;
		// the handler enforces driver_id == userID for non-owner callers.
		protected.GET("/loads/mine", controllers.ListMyLoads)
		protected.GET("/loads/mine/:id", controllers.GetMyLoad)
		protected.POST("/loads/:id/transition", controllers.TransitionLoad)

		// Owner-only.
		ownerOnly := protected.Group("")
		ownerOnly.Use(middleware.RequireOwner())
		{
			ownerOnly.POST("/trucks", controllers.CreateTruck)
			ownerOnly.PUT("/trucks/:id", controllers.UpdateTruck)
			ownerOnly.DELETE("/trucks/:id", controllers.DeleteTruck)

			ownerOnly.GET("/expenses", controllers.GetExpenses)
			ownerOnly.POST("/expenses", controllers.CreateExpense)
			ownerOnly.DELETE("/expenses/:id", controllers.DeleteExpense)

			ownerOnly.POST("/invites", controllers.CreateInvite)
			ownerOnly.GET("/invites", controllers.GetInvites)
			ownerOnly.DELETE("/invites/:id", controllers.DeleteInvite)

			// Loads — owner tier. Drivers must not list fleet-wide loads or
			// see other drivers' assignments; the driver surface is /loads/mine
			// in the authenticated tier above.
			ownerOnly.POST("/loads", controllers.CreateLoad)
			ownerOnly.GET("/loads", controllers.ListLoads)
			ownerOnly.GET("/loads/:id", controllers.GetLoad)
			ownerOnly.PUT("/loads/:id", controllers.UpdateLoad)
			ownerOnly.DELETE("/loads/:id", controllers.DeleteLoad)

			ownerOnly.GET("/fleet/drivers", controllers.ListFleetDrivers)
		}
	}
}
