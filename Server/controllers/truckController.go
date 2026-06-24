package controllers

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// validate is the single package-wide validator instance, shared by every
// controller (user, truck, load, invite, mileage). One instance means the
// reflection cache is built once and all custom rules register in one place.
// Safe for concurrent use per validator/v10.
var validate *validator.Validate

func init() {
	validate = validator.New()
	// Init-time misregistration is a programmer bug, not a runtime condition.
	// Panic so a degraded validator never silently accepts arbitrary year values.
	if err := validate.RegisterValidation("truckyear", models.ValidateTruckYear); err != nil {
		panic(fmt.Sprintf("failed to register truckyear validator: %v", err))
	}
}

// GetTruck returns a single truck inside the caller's fleet.
//
// Ownership is enforced by including fleet_id in the lookup filter — a request
// for another fleet's truck ID matches zero documents and returns 404,
// indistinguishable from a truly nonexistent truck (no existence-oracle leak).
func GetTruck(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	var truck models.Truck
	err = truckCollection.FindOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID}).Decode(&truck)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}
	if err != nil {
		log.Printf("GetTruck: find failed fleet=%s truck=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch truck"})
		return
	}

	c.JSON(http.StatusOK, truck)
}

// GetUserTrucks returns the caller's fleet roster, paged.
//
// Pagination: ?page=N&page_size=M. Defaults page=1, page_size=25, max=100.
// Total count exposed via X-Total-Count for paged-UI wiring.
func GetUserTrucks(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	filter := bson.M{"fleet_id": fleetID}

	total, err := truckCollection.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("GetUserTrucks: count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trucks"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := truckCollection.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetUserTrucks: find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trucks"})
		return
	}
	defer cursor.Close(ctx)

	trucks := []models.Truck{}
	if err := cursor.All(ctx, &trucks); err != nil {
		log.Printf("GetUserTrucks: decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode trucks"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, trucks)
}

// CreateTruck inserts a new truck record into the caller's fleet.
//
// SECURITY: pins fleet_id (tenancy boundary) and user_id (creator audit) from
// the JWT context, never from client input. ID is freshly minted server-side.
// Validation runs after the strip-and-pin so callers cannot smuggle a different
// fleet/user via mass-assignment.
func CreateTruck(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	var truck models.Truck
	if !decodeStrict(c, &truck) {
		return
	}

	// Strip + pin server-controlled identity fields BEFORE validation.
	// See UpdateTruck for the same defense applied to the patch path.
	truck.ID = bson.NewObjectID()
	truck.UserID = userID
	truck.FleetID = fleetID

	if err := validate.Struct(truck); err != nil {
		badRequest(c, err, "Invalid truck data")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	// Plan gate: a fleet may only register as many trucks as its subscription
	// tier allows (free-trial limit when unsubscribed). Enforced server-side so
	// the band cannot be bypassed by a crafted request.
	fleet, err := loadFleet(ctx, fleetID)
	if err != nil {
		log.Printf("CreateTruck: load fleet failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create truck"})
		return
	}
	count, err := truckCollection.CountDocuments(ctx, bson.M{"fleet_id": fleetID})
	if err != nil {
		log.Printf("CreateTruck: count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create truck"})
		return
	}
	if limit := fleetTruckLimit(fleet.SubscriptionStatus, fleet.SubscriptionTier, fleet.PromoBonusTrucks > 0); count >= int64(limit) {
		msg := "Start your 7-day free trial to add trucks."
		if limit > 0 {
			suffix := ""
			if limit != 1 {
				suffix = "s"
			}
			msg = fmt.Sprintf("Your plan covers up to %d truck%s. Upgrade to add more.", limit, suffix)
		}
		c.JSON(http.StatusPaymentRequired, gin.H{"error": msg})
		return
	}

	_, err = truckCollection.InsertOne(ctx, truck)
	if err != nil {
		log.Printf("CreateTruck: insert failed fleet=%s user=%s: %v", fleetID, userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create truck"})
		return
	}

	c.JSON(http.StatusCreated, truck)
}

// UpdateTruck patches a truck the caller's fleet owns.
//
// SECURITY: strips caller-controlled identity fields BEFORE the $set so a
// caller cannot send {"user_id": "<victim>"}, {"fleet_id": "<other_fleet>"},
// or {"_id": "..."} to transfer the truck record into another tenant or
// corrupt the document key. The bson:"...,omitempty" tags on Truck mean the
// zero values below are omitted from the BSON update document; the Mongo
// filter pins fleet_id so the lookup itself is tenant-scoped.
//
// (A dedicated TruckUpdate DTO would be stricter, but Truck has 20+ optional
// fields and a parallel struct would double maintenance burden. Revisit if
// new auth-scoped fields are added.)
func UpdateTruck(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	var updateData models.Truck
	if err := c.ShouldBindJSON(&updateData); err != nil {
		badRequest(c, err, "Invalid truck data")
		return
	}

	// Strip caller-controlled identity. Zero values are dropped via omitempty.
	updateData.ID = bson.ObjectID{}
	updateData.UserID = ""
	updateData.FleetID = ""

	// Only validate Year if provided — it must not exceed next year.
	if updateData.Year != 0 {
		if err := validate.StructPartial(updateData, "Year"); err != nil {
			badRequest(c, err, "Invalid truck data")
			return
		}
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.UpdateOne(ctx,
		bson.M{"_id": objID, "fleet_id": fleetID},
		bson.M{"$set": updateData},
	)
	if err != nil {
		log.Printf("UpdateTruck: update failed fleet=%s truck=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update truck"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Truck updated successfully"})
}

// DeleteTruck removes a truck from the caller's fleet.
func DeleteTruck(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.DeleteOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID})
	if err != nil {
		log.Printf("DeleteTruck: delete failed fleet=%s truck=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete truck"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Truck deleted successfully"})
}
