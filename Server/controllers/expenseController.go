package controllers

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// GetExpenses returns the caller's fleet expenses, sorted newest-first.
//
// Pagination: ?page=N&page_size=M. Defaults: page=1, page_size=25, max=100.
// Total count is exposed via the X-Total-Count header so the frontend can wire
// up paged UI without a breaking response shape change.
func GetExpenses(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	if fleetID == "" {
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
	col := database.GetExpenseCollection()

	filter := bson.M{"fleet_id": fleetID}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("GetExpenses: count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch expenses"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "date", Value: -1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetExpenses: find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch expenses"})
		return
	}
	defer cursor.Close(ctx)

	expenses := []models.Expense{}
	if err := cursor.All(ctx, &expenses); err != nil {
		log.Printf("GetExpenses: decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode expenses"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, expenses)
}

// CreateExpense persists a new expense for the caller's fleet.
//
// SECURITY: Verifies the supplied truck_id resolves to a truck inside the
// caller's fleet BEFORE inserting. Without this check, any authenticated user
// could attach an expense to another tenant's truck simply by guessing/scraping
// that truck's ObjectID. We deliberately collapse "not in your fleet" and
// "doesn't exist" into a single 404 so the endpoint cannot be used as an
// existence oracle to enumerate other tenants' truck IDs.
func CreateExpense(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")
	if userID == "" || fleetID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var expense models.Expense
	if err := c.ShouldBindJSON(&expense); err != nil {
		badRequest(c, err, "Invalid expense data")
		return
	}

	// truck_id is currently stored as a string on the expense document
	// (see models.Expense). Parse-validate it as an ObjectID so an attacker
	// cannot smuggle a non-ObjectID value past the in-fleet lookup.
	// TODO(schema): migrate Expense.TruckID to bson.ObjectID for type-level
	// consistency with the trucks collection.
	truckObjID, err := bson.ObjectIDFromHex(expense.TruckID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			// Generic 404: do NOT reveal whether the truck exists in another fleet.
			c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
			return
		}
		log.Printf("CreateExpense: in-fleet lookup failed fleet=%s truck=%s: %v", fleetID, expense.TruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create expense"})
		return
	}

	// Pin server-managed identity. Creator user_id is captured for audit; the
	// tenancy boundary is fleet_id.
	expense.ID = bson.NewObjectID()
	expense.UserID = userID
	expense.FleetID = fleetID

	col := database.GetExpenseCollection()
	if _, err := col.InsertOne(ctx, expense); err != nil {
		log.Printf("CreateExpense: insert failed fleet=%s user=%s: %v", fleetID, userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create expense"})
		return
	}

	c.JSON(http.StatusCreated, expense)
}

// assertTruckInFleet returns nil only when a truck with truckID exists AND
// belongs to fleetID. It returns mongo.ErrNoDocuments for either failure case
// so callers can map both to an indistinguishable 404 (avoiding existence-
// oracle leaks). The query is covered by the (fleet_id, _id) compound index
// created in database.ensureIndexes — see RISK below.
//
// RISK: A future change that drops the (fleet_id, _id) index would silently
// degrade this lookup to a collection scan on every CreateExpense /
// UpsertMileageLog call.
func assertTruckInFleet(ctx context.Context, truckID bson.ObjectID, fleetID string) error {
	truckCol := database.GetTruckCollection()
	// Project only _id — we only care about existence, not contents. Keeps the
	// network payload minimal and signals intent.
	opts := options.FindOne().SetProjection(bson.M{"_id": 1})
	return truckCol.FindOne(ctx, bson.M{"_id": truckID, "fleet_id": fleetID}, opts).Err()
}

// DeleteExpense removes one of the caller's fleet's expenses.
//
// Ownership is enforced by including fleet_id in the delete filter — a request
// against another fleet's expense ID matches zero documents and returns 404.
func DeleteExpense(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	if fleetID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid expense ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetExpenseCollection()

	result, err := col.DeleteOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID})
	if err != nil {
		log.Printf("DeleteExpense: delete failed fleet=%s expense=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete expense"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Expense not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Expense deleted"})
}
