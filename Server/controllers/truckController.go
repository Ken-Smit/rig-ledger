package controllers

import (
	"errors"
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

var truckValidator *validator.Validate

func init() {
	truckValidator = validator.New()
	truckValidator.RegisterValidation("truckyear", models.ValidateTruckYear)
}

// GetTruck returns a single truck owned by the authenticated user.
//
// Ownership is enforced by including user_id in the lookup filter — a request
// for another user's truck ID matches zero documents and returns 404,
// indistinguishable from a truly nonexistent truck (no existence-oracle leak).
func GetTruck(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	var truck models.Truck
	err = truckCollection.FindOne(ctx, bson.M{"_id": objID, "user_id": userID}).Decode(&truck)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}
	if err != nil {
		log.Printf("GetTruck: find failed user=%s truck=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch truck"})
		return
	}

	c.JSON(http.StatusOK, truck)
}

// GetUserTrucks returns the authenticated user's fleet, paged.
//
// Pagination: ?page=N&page_size=M. Defaults page=1, page_size=25, max=100.
// Total count exposed via X-Total-Count for paged-UI wiring.
func GetUserTrucks(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	filter := bson.M{"user_id": userID}

	total, err := truckCollection.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("GetUserTrucks: count failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trucks"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: 1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := truckCollection.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetUserTrucks: find failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trucks"})
		return
	}
	defer cursor.Close(ctx)

	trucks := []models.Truck{}
	if err := cursor.All(ctx, &trucks); err != nil {
		log.Printf("GetUserTrucks: decode failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode trucks"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, trucks)
}

func CreateTruck(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var truck models.Truck
	if err := c.ShouldBindJSON(&truck); err != nil {
		badRequest(c, err, "Invalid truck data")
		return
	}

	if err := truckValidator.Struct(truck); err != nil {
		badRequest(c, err, "Invalid truck data")
		return
	}

	truck.ID = bson.NewObjectID()
	truck.UserID = userID

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	_, err := truckCollection.InsertOne(ctx, truck)
	if err != nil {
		log.Printf("CreateTruck: insert failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create truck"})
		return
	}

	c.JSON(http.StatusCreated, truck)
}

func UpdateTruck(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

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

	// SECURITY: strip caller-controlled identity fields BEFORE the $set.
	// Without this, a caller could send {"user_id": "<victim>"} and transfer
	// the truck record into another user's account, or set "_id" and corrupt
	// the document key. The bson:"...,omitempty" tags on Truck mean the zero
	// values below are omitted from the BSON update document, while pinning
	// UserID to the authenticated subject keeps the field internally consistent.
	// (A dedicated TruckUpdate DTO would be stricter, but Truck has 20+ optional
	// fields and a parallel struct would double maintenance burden. Revisit if
	// new auth-scoped fields are added — e.g. an org_id would require a DTO.)
	updateData.ID = bson.ObjectID{}
	updateData.UserID = userID

	// Only validate Year if provided — it must not exceed next year
	if updateData.Year != 0 {
		if err := truckValidator.StructPartial(updateData, "Year"); err != nil {
			badRequest(c, err, "Invalid truck data")
			return
		}
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.UpdateOne(ctx,
		bson.M{"_id": objID, "user_id": userID},
		bson.M{"$set": updateData},
	)
	if err != nil {
		log.Printf("UpdateTruck: update failed user=%s truck=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update truck"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Truck updated successfully"})
}

func DeleteTruck(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.DeleteOne(ctx, bson.M{"_id": objID, "user_id": userID})
	if err != nil {
		log.Printf("DeleteTruck: delete failed user=%s truck=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete truck"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Truck deleted successfully"})
}
