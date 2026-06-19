package controllers

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// GetMileageLogs returns paged mileage entries for one truck in the caller's
// fleet, newest-first.
//
// SECURITY: caller must be authenticated AND the truck must belong to the
// caller's fleet (assertTruckInFleet). Cross-fleet reads collapse to a
// generic 404 to avoid existence-oracle leaks against other tenants' truck
// IDs.
func GetMileageLogs(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	rawTruckID := c.Query("truck_id")
	if rawTruckID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "truck_id is required"})
		return
	}
	truckObjID, err := bson.ObjectIDFromHex(rawTruckID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
			return
		}
		log.Printf("GetMileageLogs: in-fleet lookup failed fleet=%s truck=%s: %v", fleetID, rawTruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch mileage logs"})
		return
	}

	col := database.GetMileageLogCollection()
	filter := bson.M{"fleet_id": fleetID, "truck_id": rawTruckID}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("GetMileageLogs: count failed fleet=%s truck=%s: %v", fleetID, rawTruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch mileage logs"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "date", Value: -1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetMileageLogs: find failed fleet=%s truck=%s: %v", fleetID, rawTruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch mileage logs"})
		return
	}
	defer cursor.Close(ctx)

	logs := []models.MileageLog{}
	if err := cursor.All(ctx, &logs); err != nil {
		log.Printf("GetMileageLogs: decode failed fleet=%s truck=%s: %v", fleetID, rawTruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode mileage logs"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, logs)
}

// UpsertMileageLog creates or amends a per-truck, per-day odometer entry.
//
// SECURITY: tenancy is enforced two ways — assertTruckInFleet on the truck and
// the {fleet_id, truck_id, date} upsert filter so a forged body cannot land a
// document in another tenant's collection slice.
//
// CONSISTENCY:
//   - Pointers on StartMileage / EndMileage distinguish "omit" from "zero".
//     We refuse a request that supplies neither so a stray POST with only
//     truck_id+date cannot create an empty stub.
//   - We fetch the existing same-day doc, merge with the incoming non-nil
//     fields, and validate the merged (start, end) order BEFORE upserting.
//     This prevents a partial PATCH (end-only, when start is already higher
//     than the new end) from passing a per-field validator and corrupting
//     the row. The fetch+merge+upsert race is bounded by the unique index
//     created in Track 1.
//   - $setOnInsert pins fleet_id, truck_id, driver_id, date, created_at on
//     the first write; later edits (by anyone in the same fleet) update the
//     mileage fields and updated_at without rewriting attribution.
func UpsertMileageLog(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	userID := c.GetString("userID")

	var req models.MileageLogUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Invalid mileage entry")
		return
	}
	if err := validate.Struct(req); err != nil {
		badRequest(c, err, "Invalid mileage entry")
		return
	}
	if req.StartMileage == nil && req.EndMileage == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Provide start_mileage or end_mileage"})
		return
	}

	truckObjID, err := bson.ObjectIDFromHex(req.TruckID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
			return
		}
		log.Printf("UpsertMileageLog: in-fleet lookup failed fleet=%s truck=%s: %v", fleetID, req.TruckID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save mileage entry"})
		return
	}

	col := database.GetMileageLogCollection()
	filter := bson.M{
		"fleet_id": fleetID,
		"truck_id": req.TruckID,
		"date":     req.Date,
	}

	// Fetch existing doc (if any) and merge with incoming non-nil fields so the
	// post-merge start/end ordering can be checked BEFORE the upsert lands.
	var existing models.MileageLog
	hasExisting := true
	if err := col.FindOne(ctx, filter).Decode(&existing); err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("UpsertMileageLog: pre-fetch failed fleet=%s truck=%s date=%s: %v", fleetID, req.TruckID, req.Date, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save mileage entry"})
			return
		}
		hasExisting = false
	}

	mergedStart := existing.StartMileage
	mergedEnd := existing.EndMileage
	if req.StartMileage != nil {
		mergedStart = req.StartMileage
	}
	if req.EndMileage != nil {
		mergedEnd = req.EndMileage
	}
	if mergedStart != nil && mergedEnd != nil && *mergedEnd < *mergedStart {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "End-of-day mileage must be greater than or equal to start-of-day mileage.",
		})
		return
	}

	now := time.Now()
	set := bson.M{"updated_at": now}
	if req.StartMileage != nil {
		set["start_mileage"] = *req.StartMileage
	}
	if req.EndMileage != nil {
		set["end_mileage"] = *req.EndMileage
	}

	update := bson.M{
		"$set": set,
		"$setOnInsert": bson.M{
			"fleet_id":   fleetID,
			"truck_id":   req.TruckID,
			"driver_id":  userID,
			"date":       req.Date,
			"created_at": now,
		},
	}

	if _, err := col.UpdateOne(ctx, filter, update, options.UpdateOne().SetUpsert(true)); err != nil {
		log.Printf("UpsertMileageLog: upsert failed fleet=%s truck=%s date=%s: %v", fleetID, req.TruckID, req.Date, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save mileage entry"})
		return
	}

	// Return the now-current document. We round-trip rather than constructing
	// it locally so the caller sees the canonical persisted state (including
	// fields written by $setOnInsert and the merged mileage values).
	var saved models.MileageLog
	if err := col.FindOne(ctx, filter).Decode(&saved); err != nil {
		log.Printf("UpsertMileageLog: post-fetch failed fleet=%s truck=%s date=%s: %v", fleetID, req.TruckID, req.Date, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save mileage entry"})
		return
	}

	if hasExisting {
		c.JSON(http.StatusOK, saved)
	} else {
		c.JSON(http.StatusCreated, saved)
	}
}
