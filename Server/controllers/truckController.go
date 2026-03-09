package controllers

import (
	"net/http"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var truckValidator *validator.Validate

func init() {
	truckValidator = validator.New()
	truckValidator.RegisterValidation("truckyear", models.ValidateTruckYear)
}

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

	ctx := c.Request.Context()
	truckCollection := database.GetTruckCollection()

	var truck models.Truck
	err = truckCollection.FindOne(ctx, bson.M{"_id": objID, "user_id": userID}).Decode(&truck)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch truck"})
		return
	}

	c.JSON(http.StatusOK, truck)
}

func GetUserTrucks(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	ctx := c.Request.Context()
	truckCollection := database.GetTruckCollection()

	cursor, err := truckCollection.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trucks"})
		return
	}
	defer cursor.Close(ctx)

	var trucks []models.Truck
	if err := cursor.All(ctx, &trucks); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode trucks"})
		return
	}

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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := truckValidator.Struct(truck); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	truck.ID = bson.NewObjectID()
	truck.UserID = userID

	ctx := c.Request.Context()
	truckCollection := database.GetTruckCollection()

	_, err := truckCollection.InsertOne(ctx, truck)
	if err != nil {
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Only validate Year if provided — it must not exceed next year
	if updateData.Year != 0 {
		if err := truckValidator.StructPartial(updateData, "Year"); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	ctx := c.Request.Context()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.UpdateOne(ctx,
		bson.M{"_id": objID, "user_id": userID},
		bson.M{"$set": updateData},
	)
	if err != nil {
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

	ctx := c.Request.Context()
	truckCollection := database.GetTruckCollection()

	result, err := truckCollection.DeleteOne(ctx, bson.M{"_id": objID, "user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete truck"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Truck deleted successfully"})
}
