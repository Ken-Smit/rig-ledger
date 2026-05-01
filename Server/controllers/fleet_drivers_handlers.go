package controllers

import (
	"log"
	"net/http"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// fleetDriverDoc is the Mongo decode shape for the fleet-drivers projection.
// Only the fields the assign-driver dropdown needs cross the wire from Mongo
// into application memory — bcrypt hashes, refresh tokens, and email addresses
// are deliberately excluded.
type fleetDriverDoc struct {
	ID        bson.ObjectID `bson:"_id"`
	FirstName string        `bson:"first_name"`
	LastName  string        `bson:"last_name"`
}

// ListFleetDrivers returns the drivers in the caller's fleet.
//
// SECURITY: filters on fleet_id from the JWT context AND role == "driver", so
// the caller can never enumerate users outside their own fleet, and owner
// accounts cannot accidentally appear in the assign-driver dropdown.
//
// PERFORMANCE: Mongo projection clamps the read to (_id, first_name, last_name)
// per CLAUDE.md ("never fetch a full document when you only need 3 fields").
// Result is unpaginated — a fleet with thousands of drivers is implausible
// for the target audience (1-50 trucks) and the dropdown UX would degrade
// before pagination becomes useful.
func ListFleetDrivers(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	if fleetID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	users := database.GetUserCollection()

	opts := options.Find().
		SetProjection(bson.M{"_id": 1, "first_name": 1, "last_name": 1}).
		SetSort(bson.D{{Key: "first_name", Value: 1}, {Key: "last_name", Value: 1}})

	cursor, err := users.Find(ctx,
		bson.M{"fleet_id": fleetID, "role": models.RoleDriver},
		opts,
	)
	if err != nil {
		log.Printf("ListFleetDrivers: find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch drivers"})
		return
	}
	defer cursor.Close(ctx)

	var docs []fleetDriverDoc
	if err := cursor.All(ctx, &docs); err != nil {
		log.Printf("ListFleetDrivers: decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode drivers"})
		return
	}

	resp := make([]models.FleetDriverResponse, 0, len(docs))
	for _, d := range docs {
		resp = append(resp, models.FleetDriverResponse{
			UserID:    d.ID.Hex(),
			FirstName: d.FirstName,
			LastName:  d.LastName,
		})
	}

	c.JSON(http.StatusOK, resp)
}
