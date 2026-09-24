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
		// ── Always reachable, regardless of subscription ──────────────────
		// These must stay open even for an unentitled fleet so a lapsed owner
		// can re-subscribe and anyone can view/close their account.
		protected.POST("/auth/logout", controllers.Logout)
		protected.GET("/user/profile", controllers.GetUserProfile)
		protected.PUT("/user/profile", controllers.UpdateUserProfile)
		protected.DELETE("/user/profile", controllers.DeleteUser)

		// Billing — owner-only but NOT entitlement-gated: you must be able to
		// reach checkout/portal precisely when you are NOT yet paying.
		billing := protected.Group("")
		billing.Use(middleware.RequireOwner())
		{
			billing.GET("/billing/subscription", controllers.GetSubscription)
			billing.POST("/billing/checkout", controllers.CreateCheckoutSession)
			billing.POST("/billing/portal", controllers.CreatePortalSession)
			billing.POST("/billing/promo", controllers.RedeemPromo)
		}

		// ── Entitlement-gated surface ─────────────────────────────────────
		// Everything below requires an active fleet subscription. Drivers
		// inherit entitlement from the owner's fleet via the shared fleet_id,
		// so an invited driver has access exactly while the owner is paying.
		// RequireEntitled reads the "entitled" claim set by JWTAuthMiddleware.
		entitled := protected.Group("")
		entitled.Use(middleware.RequireEntitled())
		{
			// Any authenticated role (owner OR driver).
			entitled.GET("/trucks", controllers.GetUserTrucks)
			entitled.GET("/trucks/:id", controllers.GetTruck)

			entitled.GET("/mileage-logs", controllers.GetMileageLogs)
			entitled.POST("/mileage-logs", controllers.UpsertMileageLog)

			// Loads — driver tier. Literal /loads/mine paths registered before
			// /loads/:id (in the owner group) so the radix tree resolves the
			// literal path without colliding with the param route. TransitionLoad
			// lives here (not owner-only) because both drivers and owners call
			// it; the handler enforces driver_id == userID for non-owner callers.
			entitled.GET("/loads/mine", controllers.ListMyLoads)
			entitled.GET("/loads/mine/:id", controllers.GetMyLoad)
			entitled.POST("/loads/:id/transition", controllers.TransitionLoad)

			// Hours of Service — owner OR driver. Each user logs and reads their
			// OWN duty status; the handlers pin driver_id == JWT subject, so this
			// is intentionally NOT owner-gated. NOTE: a manual web app is not a
			// certified ELD — the status response carries the mandatory disclaimer.
			entitled.POST("/hos/logs", controllers.CreateHOSLog)
			entitled.GET("/hos/logs", controllers.GetHOSLogs)
			entitled.GET("/hos/status", controllers.GetHOSStatus)

			// Owner-only (and entitled).
			ownerOnly := entitled.Group("")
			ownerOnly.Use(middleware.RequireOwner())
			{
				ownerOnly.POST("/trucks", controllers.CreateTruck)
				ownerOnly.PUT("/trucks/:id", controllers.UpdateTruck)
				ownerOnly.DELETE("/trucks/:id", controllers.DeleteTruck)

				ownerOnly.GET("/expenses", controllers.GetExpenses)
				ownerOnly.POST("/expenses", controllers.CreateExpense)
				// /expenses/scan carries a per-user rate limiter: each call uploads
				// up to 10 MB and makes a billable Gemini vision call, so it is
				// throttled independently of (and far tighter than) the other
				// expense routes. ScanRateLimiter keys on userID, which is populated
				// by JWTAuthMiddleware above — safe to run here.
				ownerOnly.POST("/expenses/scan", middleware.ScanRateLimiter(), controllers.ScanReceipt)
				ownerOnly.DELETE("/expenses/:id", controllers.DeleteExpense)

				ownerOnly.POST("/invites", controllers.CreateInvite)
				ownerOnly.GET("/invites", controllers.GetInvites)
				ownerOnly.DELETE("/invites/:id", controllers.DeleteInvite)

				// Loads — owner tier. Drivers must not list fleet-wide loads or
				// see other drivers' assignments; the driver surface is /loads/mine
				// in the entitled tier above.
				ownerOnly.POST("/loads", controllers.CreateLoad)
				ownerOnly.GET("/loads", controllers.ListLoads)
				ownerOnly.GET("/loads/:id", controllers.GetLoad)
				ownerOnly.PUT("/loads/:id", controllers.UpdateLoad)
				ownerOnly.DELETE("/loads/:id", controllers.DeleteLoad)

				ownerOnly.GET("/fleet/drivers", controllers.ListFleetDrivers)

				// IFTA — owner-only fuel-tax bookkeeping + quarterly return. Drivers
				// log raw mileage via /mileage-logs; jurisdiction-level IFTA data and
				// the computed return are financial and stay with the owner.
				ownerOnly.POST("/ifta/miles", controllers.CreateIftaMiles)
				ownerOnly.GET("/ifta/miles", controllers.ListIftaMiles)
				ownerOnly.DELETE("/ifta/miles/:id", controllers.DeleteIftaMiles)
				ownerOnly.POST("/ifta/fuel", controllers.CreateIftaFuel)
				ownerOnly.GET("/ifta/fuel", controllers.ListIftaFuel)
				ownerOnly.DELETE("/ifta/fuel/:id", controllers.DeleteIftaFuel)
				ownerOnly.GET("/ifta/return", controllers.GetIftaReturn)
			}
		}
	}
}
