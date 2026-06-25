package controllers

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// hosStatusLookback is how far back the status engine reads. The longest FMCSA
// clock that matters is the 34-hour restart inside the 8-day cycle window, so 9
// days of trailing logs (8-day cycle + a day of slack) is sufficient context to
// compute every clock correctly while keeping the read bounded.
const hosStatusLookback = 9 * 24 * time.Hour

// CreateHOSLog records one duty-status change for the calling driver.
//
// SECURITY: DriverID is pinned to the JWT subject and FleetID to the JWT fleet
// — a caller can only ever log hours for themselves. The DTO plus
// DisallowUnknownFields blocks mass-assignment of identity fields. An optional
// truck_id is asserted in-fleet (collapsing miss + foreign into one 404) before
// insert. A ChangedAt more than 2 minutes in the future is rejected so a driver
// cannot pre-date a status to game the clocks.
func CreateHOSLog(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	var req models.DutyStatusLogRequest
	if !decodeStrict(c, &req) {
		return
	}
	if err := validate.Struct(&req); err != nil {
		badRequest(c, err, "Invalid duty status")
		return
	}

	// Default ChangedAt to now; reject a future instant beyond the skew window.
	now := time.Now().UTC()
	changedAt := now
	if req.ChangedAt != nil {
		changedAt = req.ChangedAt.UTC()
		if changedAt.After(now.Add(services.FutureSkew)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Status time cannot be in the future"})
			return
		}
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	// Optional truck must belong to the caller's fleet. Reuse the shared in-fleet
	// assertion so the ownership check is identical to every other surface.
	if req.TruckID != "" {
		truckObjID, err := bson.ObjectIDFromHex(req.TruckID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
			return
		}
		if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
				return
			}
			log.Printf("CreateHOSLog: in-fleet lookup failed fleet=%s truck=%s: %v", fleetID, req.TruckID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save duty status"})
			return
		}
	}

	logEntry := models.DutyStatusLog{
		ID:        bson.NewObjectID(),
		FleetID:   fleetID,
		DriverID:  userID,
		TruckID:   req.TruckID,
		Status:    req.Status,
		ChangedAt: changedAt,
		Location:  req.Location,
		Note:      req.Note,
		CreatedAt: now,
	}

	if _, err := database.GetHosLogCollection().InsertOne(ctx, logEntry); err != nil {
		log.Printf("CreateHOSLog: insert failed fleet=%s driver=%s: %v", fleetID, userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save duty status"})
		return
	}

	c.JSON(http.StatusCreated, logEntry)
}

// GetHOSLogs returns the caller's own duty-status logs, newest-first, paged.
//
// SECURITY: filtered to driver_id == JWT subject AND fleet_id == JWT fleet, so
// a driver only ever sees their own logs. Optional ?from / ?to (YYYY-MM-DD)
// narrow on changed_at.
func GetHOSLogs(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	filter := bson.M{"driver_id": userID, "fleet_id": fleetID}

	// Optional date range on changed_at. Parsed as calendar days (UTC); `to` is
	// made inclusive by advancing to the next midnight.
	changedRange := bson.M{}
	if from := c.Query("from"); from != "" {
		t, perr := time.Parse("2006-01-02", from)
		if perr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' date"})
			return
		}
		changedRange["$gte"] = t.UTC()
	}
	if to := c.Query("to"); to != "" {
		t, perr := time.Parse("2006-01-02", to)
		if perr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' date"})
			return
		}
		changedRange["$lt"] = t.AddDate(0, 0, 1).UTC()
	}
	if len(changedRange) > 0 {
		filter["changed_at"] = changedRange
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetHosLogCollection()

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("GetHOSLogs: count failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch duty logs"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "changed_at", Value: -1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetHOSLogs: find failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch duty logs"})
		return
	}
	defer cursor.Close(ctx)

	logs := []models.DutyStatusLog{}
	if err := cursor.All(ctx, &logs); err != nil {
		log.Printf("GetHOSLogs: decode failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode duty logs"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, logs)
}

// GetHOSStatus computes and returns the caller's live FMCSA compliance clocks.
//
// LEGAL: the response carries a fixed `disclaimer` field. This app is NOT a
// certified ELD under the FMCSA mandate (49 CFR §395.8) — it is a manual
// planning/personal-records tool. Drivers subject to the ELD mandate must use a
// registered device. The disclaimer is part of the contract and must never be
// stripped from the response.
//
// SECURITY: reads only the caller's own logs (driver_id + fleet_id) from the
// trailing lookback window, sorted ascending, and hands them to the pure
// ComputeHOS engine.
func GetHOSStatus(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	now := time.Now().UTC()
	since := now.Add(-hosStatusLookback)

	filter := bson.M{
		"driver_id":  userID,
		"fleet_id":   fleetID,
		"changed_at": bson.M{"$gte": since},
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "changed_at", Value: 1}})
	cursor, err := database.GetHosLogCollection().Find(ctx, filter, opts)
	if err != nil {
		log.Printf("GetHOSStatus: find failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to compute hours"})
		return
	}
	defer cursor.Close(ctx)

	var logs []models.DutyStatusLog
	if err := cursor.All(ctx, &logs); err != nil {
		log.Printf("GetHOSStatus: decode failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to compute hours"})
		return
	}

	c.JSON(http.StatusOK, services.ComputeHOS(logs, now))
}
