package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sort"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ----- helpers ---------------------------------------------------------------

// assertDriverInFleet returns nil only when a user with driverID exists, has
// role=driver, and belongs to fleetID. Returns mongo.ErrNoDocuments otherwise.
//
// SECURITY: callers map ErrNoDocuments to a generic 404 so the endpoint cannot
// be used as an oracle to enumerate user IDs across tenants. Mirrors the
// assertTruckInFleet pattern in expenseController.go.
func assertDriverInFleet(ctx context.Context, driverHex, fleetID string) error {
	driverObjID, err := bson.ObjectIDFromHex(driverHex)
	if err != nil {
		return mongo.ErrNoDocuments
	}
	users := database.GetUserCollection()
	opts := options.FindOne().SetProjection(bson.M{"_id": 1})
	return users.FindOne(ctx,
		bson.M{"_id": driverObjID, "fleet_id": fleetID, "role": models.RoleDriver},
		opts,
	).Err()
}

// resolveAssignee validates a driver_id supplied to CreateLoad/UpdateLoad.
// Three legal cases:
//
//  1. Empty string → unassigned (owner-operator may not have picked a driver).
//  2. driverHex == callerID → owner self-assignment. Owner-only routes are
//     gated by RequireOwner, so callerID is the owner's user_id; the owner is
//     not in the role=driver set, so assertDriverInFleet would reject them.
//  3. Otherwise → must resolve via assertDriverInFleet.
//
// SECURITY: this helper is only safe inside owner-only handlers. Calling it
// from a route that isn't behind RequireOwner would let a driver smuggle
// driver_id == own userID and bypass assertDriverInFleet's role pin.
func resolveAssignee(ctx context.Context, driverHex, fleetID, callerID string) error {
	if driverHex == "" {
		return nil
	}
	if driverHex == callerID {
		return nil
	}
	return assertDriverInFleet(ctx, driverHex, fleetID)
}

// User-facing copy for the multi-stop validator. Intentionally authored
// in plain-English, actionable language so the modal can render the message
// verbatim — non-technical operators must be able to act on the feedback.
const (
	msgStopsTooFew     = "Add at least one pickup and one dropoff."
	msgFirstStopPickup = "The first stop must be a pickup."
	msgStopsBothKinds  = "Loads need at least one pickup and one dropoff."
	msgInvalidTimezone = "Unrecognized timezone."
	msgInvalidDate     = "Date must be YYYY-MM-DD."
)

// normalizeStops canonicalizes a stops slice in place: sorts by Sequence,
// rewrites sequences to a dense 0..N-1 range, and enforces:
//   - at least one pickup AND at least one dropoff
//   - the earliest stop is a pickup (no driving with empty trailer first)
//
// Returns the empty string on success. On failure, returns an intentionally
// user-facing message (one of the const strings above). Returning a string
// rather than an error keeps the controller from leaking err.Error() into
// the JSON body and aligns with the "client-facing errors must be
// user-readable" guideline.
func normalizeStops(stops []models.Stop) string {
	if len(stops) < 2 {
		return msgStopsTooFew
	}

	sort.SliceStable(stops, func(i, j int) bool {
		return stops[i].Sequence < stops[j].Sequence
	})

	if stops[0].Kind != models.StopKindPickup {
		return msgFirstStopPickup
	}

	hasPickup, hasDropoff := false, false
	for i := range stops {
		stops[i].Sequence = i
		switch stops[i].Kind {
		case models.StopKindPickup:
			hasPickup = true
		case models.StopKindDropoff:
			hasDropoff = true
		}
	}
	if !hasPickup || !hasDropoff {
		return msgStopsBothKinds
	}
	return ""
}

// pickupTimeOf returns the earliest pickup's scheduled time. Stops must be
// normalized; the first stop is guaranteed to be a pickup.
func pickupTimeOf(stops []models.Stop) time.Time {
	return stops[0].ScheduledAt
}

// toDriverLoadResponse builds the driver-tier projection. Strips RateCents
// (financial privacy) and CreatedBy (owner-side audit metadata).
func toDriverLoadResponse(l models.Load) models.DriverLoadResponse {
	return models.DriverLoadResponse{
		ID:                l.ID,
		FleetID:           l.FleetID,
		DriverID:          l.DriverID,
		TruckID:           l.TruckID,
		ReferenceNumber:   l.ReferenceNumber,
		Stops:             l.Stops,
		ScheduledPickupAt: l.ScheduledPickupAt,
		Status:            l.Status,
		StartedAt:         l.StartedAt,
		CompletedAt:       l.CompletedAt,
		DistanceMiles:     l.DistanceMiles,
		Notes:             l.Notes,
		CreatedAt:         l.CreatedAt,
		UpdatedAt:         l.UpdatedAt,
	}
}

// decodeStrict decodes a JSON body with DisallowUnknownFields and rejects
// trailing garbage. Mirrors decodeProfileUpdate from user_handlers.go so the
// load surface gets the same mass-assignment defense.
func decodeStrict(c *gin.Context, target any) bool {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		log.Printf("decodeStrict: decode failed on %s: %v", c.FullPath(), err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		log.Printf("decodeStrict: trailing content on %s: %v", c.FullPath(), err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return false
	}
	return true
}

// parseLocalDateRange parses a YYYY-MM-DD date and IANA timezone string into
// a half-open UTC range [start, end) covering the local day.
//
// Defaults: empty date -> today in the supplied tz; empty tz -> UTC.
//
// On failure returns the user-facing message (one of msgInvalid*). The
// caller writes that message verbatim — same rationale as normalizeStops.
//
// CLAUDE.md note: prior bugs from naively interpreting client-supplied dates
// in UTC lost loads scheduled near midnight. Always bucket explicitly in the
// caller-supplied zone.
func parseLocalDateRange(dateStr, tzStr string) (time.Time, time.Time, string) {
	loc := time.UTC
	if tzStr != "" {
		l, err := time.LoadLocation(tzStr)
		if err != nil {
			return time.Time{}, time.Time{}, msgInvalidTimezone
		}
		loc = l
	}

	var day time.Time
	if dateStr == "" {
		day = time.Now().In(loc)
	} else {
		d, err := time.ParseInLocation("2006-01-02", dateStr, loc)
		if err != nil {
			return time.Time{}, time.Time{}, msgInvalidDate
		}
		day = d
	}
	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
	end := start.Add(24 * time.Hour)
	return start.UTC(), end.UTC(), ""
}

// ----- owner-tier handlers ---------------------------------------------------

// CreateLoad inserts a new load into the caller's fleet, assigned to a driver
// in the same fleet.
//
// SECURITY: pins fleet_id, created_by, status="pending", started_at=nil,
// completed_at=nil from the server side. Driver and (optional) truck are
// asserted in-fleet before insertion. Identity smuggling via the wire is
// blocked by the LoadCreateRequest DTO + DisallowUnknownFields.
func CreateLoad(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	var req models.LoadCreateRequest
	if !decodeStrict(c, &req) {
		return
	}
	if err := validate.Struct(&req); err != nil {
		badRequest(c, err, "Invalid load data")
		return
	}
	if msg := normalizeStops(req.Stops); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	if err := resolveAssignee(ctx, req.DriverID, fleetID, userID); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Driver not found"})
			return
		}
		log.Printf("CreateLoad: driver lookup failed fleet=%s driver=%s: %v", fleetID, req.DriverID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create load"})
		return
	}

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
			log.Printf("CreateLoad: truck lookup failed fleet=%s truck=%s: %v", fleetID, req.TruckID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create load"})
			return
		}
	}

	now := time.Now().UTC()
	load := models.Load{
		ID:                bson.NewObjectID(),
		FleetID:           fleetID,
		DriverID:          req.DriverID,
		TruckID:           req.TruckID,
		CreatedBy:         userID,
		ReferenceNumber:   req.ReferenceNumber,
		Stops:             req.Stops,
		ScheduledPickupAt: pickupTimeOf(req.Stops),
		Status:            models.LoadStatusPending,
		RateCents:         req.RateCents,
		DistanceMiles:     req.DistanceMiles,
		Notes:             req.Notes,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if _, err := database.GetLoadCollection().InsertOne(ctx, load); err != nil {
		log.Printf("CreateLoad: insert failed fleet=%s user=%s: %v", fleetID, userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create load"})
		return
	}
	log.Printf("CreateLoad: inserted id=%s fleet=%s driver=%q created_by=%s", load.ID.Hex(), fleetID, load.DriverID, userID)

	c.JSON(http.StatusCreated, load)
}

// ListLoads returns the caller's fleet loads, paged, with optional filters.
//
// Query params:
//
//	?status=pending|in_progress|complete  filter by status
//	?driver_id=<hex>                       filter by assigned driver
//	?from=RFC3339&to=RFC3339               filter by created_at range
//	?page=N&page_size=M                    pagination
func ListLoads(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	filter := bson.M{"fleet_id": fleetID}
	if s := c.Query("status"); s != "" {
		switch s {
		case models.LoadStatusPending, models.LoadStatusInProgress, models.LoadStatusComplete:
			filter["status"] = s
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status filter"})
			return
		}
	}
	if d := c.Query("driver_id"); d != "" {
		filter["driver_id"] = d
	}
	if from := c.Query("from"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'from' timestamp"})
			return
		}
		filter["created_at"] = bson.M{"$gte": t}
	}
	if to := c.Query("to"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'to' timestamp"})
			return
		}
		existing, ok := filter["created_at"].(bson.M)
		if !ok {
			existing = bson.M{}
		}
		existing["$lt"] = t
		filter["created_at"] = existing
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetLoadCollection()

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("ListLoads: count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch loads"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("ListLoads: find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch loads"})
		return
	}
	defer cursor.Close(ctx)

	loads := []models.Load{}
	if err := cursor.All(ctx, &loads); err != nil {
		log.Printf("ListLoads: decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode loads"})
		return
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, loads)
}

// GetLoad returns a single load inside the caller's fleet (owner-tier).
func GetLoad(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid load ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	var load models.Load
	err = database.GetLoadCollection().FindOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID}).Decode(&load)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Load not found"})
		return
	}
	if err != nil {
		log.Printf("GetLoad: find failed fleet=%s load=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch load"})
		return
	}

	c.JSON(http.StatusOK, load)
}

// UpdateLoad patches non-status, non-identity fields on a load owned by the
// caller's fleet.
//
// SECURITY:
//   - DTO + DisallowUnknownFields blocks mass-assignment.
//   - Status / timestamps cannot be changed here — TransitionLoad is the only
//     authority that moves status.
//   - Driver reassignment is allowed ONLY while status == pending. Reassigning
//     mid-trip would lose the started_at attribution.
//   - Truck reassignment is allowed at any status (real scenario: truck swap).
func UpdateLoad(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid load ID"})
		return
	}

	var req models.LoadUpdateRequest
	if !decodeStrict(c, &req) {
		return
	}
	if err := validate.Struct(&req); err != nil {
		badRequest(c, err, "Invalid load data")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetLoadCollection()

	var existing models.Load
	err = col.FindOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID}).Decode(&existing)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Load not found"})
		return
	}
	if err != nil {
		log.Printf("UpdateLoad: find failed fleet=%s load=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
		return
	}

	set := bson.M{"updated_at": time.Now().UTC()}

	if req.DriverID != nil {
		if existing.Status != models.LoadStatusPending {
			c.JSON(http.StatusConflict, gin.H{"error": "Complete or revert the load before reassigning"})
			return
		}
		if err := resolveAssignee(ctx, *req.DriverID, fleetID, userID); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Driver not found"})
				return
			}
			log.Printf("UpdateLoad: driver lookup failed fleet=%s driver=%s: %v", fleetID, *req.DriverID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
			return
		}
		set["driver_id"] = *req.DriverID
	}

	if req.TruckID != nil {
		if *req.TruckID == "" {
			set["truck_id"] = ""
		} else {
			truckObjID, err := bson.ObjectIDFromHex(*req.TruckID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid truck ID"})
				return
			}
			if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
				if errors.Is(err, mongo.ErrNoDocuments) {
					c.JSON(http.StatusNotFound, gin.H{"error": "Truck not found"})
					return
				}
				log.Printf("UpdateLoad: truck lookup failed fleet=%s truck=%s: %v", fleetID, *req.TruckID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
				return
			}
			set["truck_id"] = *req.TruckID
		}
	}

	if req.ReferenceNumber != nil {
		set["reference_number"] = *req.ReferenceNumber
	}
	if req.Stops != nil {
		stops := *req.Stops
		if msg := normalizeStops(stops); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		set["stops"] = stops
		set["scheduled_pickup_at"] = pickupTimeOf(stops)
	}
	if req.RateCents != nil {
		set["rate_cents"] = *req.RateCents
	}
	if req.DistanceMiles != nil {
		set["distance_miles"] = *req.DistanceMiles
	}
	if req.Notes != nil {
		set["notes"] = *req.Notes
	}

	if len(set) == 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No updatable fields provided"})
		return
	}

	if _, err := col.UpdateOne(ctx,
		bson.M{"_id": objID, "fleet_id": fleetID},
		bson.M{"$set": set},
	); err != nil {
		log.Printf("UpdateLoad: update failed fleet=%s load=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Load updated"})
}

// DeleteLoad removes a load from the caller's fleet at any status.
//
// Per product decision: hard delete is permitted at every status. Drivers
// reconcile on next list refresh; the UI surfaces a non-destructive toast
// when a previously-visible load disappears.
func DeleteLoad(c *gin.Context) {
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid load ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	result, err := database.GetLoadCollection().DeleteOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID})
	if err != nil {
		log.Printf("DeleteLoad: delete failed fleet=%s load=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete load"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Load not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Load deleted"})
}

// ----- driver-tier handlers --------------------------------------------------

// ListMyLoads returns the caller's assigned loads, paged.
//
// Optional filter:
//
//	?date=YYYY-MM-DD&tz=America/Chicago    bucket by local-day pickup time
//
// SECURITY: filters on driver_id == JWT.userID AND fleet_id == JWT.fleetID.
// Returns DriverLoadResponse (no rate_cents, no created_by).
func ListMyLoads(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	page, size, err := parsePagination(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pagination parameters"})
		return
	}

	filter := bson.M{"driver_id": userID, "fleet_id": fleetID}

	// Only narrow by date when the caller explicitly asks for a single day.
	// tz alone is metadata for bucketing — it must not implicitly filter,
	// or upcoming / completed loads disappear from MyLoads and any in-progress
	// load whose pickup was yesterday vanishes from the driver dashboard.
	if dateStr := c.Query("date"); dateStr != "" {
		startUTC, endUTC, msg := parseLocalDateRange(dateStr, c.Query("tz"))
		if msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		filter["scheduled_pickup_at"] = bson.M{"$gte": startUTC, "$lt": endUTC}
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetLoadCollection()

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("ListMyLoads: count failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch loads"})
		return
	}
	log.Printf("ListMyLoads: driver=%s fleet=%s filter=%v total=%d", userID, fleetID, filter, total)

	opts := options.Find().
		SetSort(bson.D{{Key: "scheduled_pickup_at", Value: 1}}).
		SetSkip((page - 1) * size).
		SetLimit(size)

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("ListMyLoads: find failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch loads"})
		return
	}
	defer cursor.Close(ctx)

	var raw []models.Load
	if err := cursor.All(ctx, &raw); err != nil {
		log.Printf("ListMyLoads: decode failed driver=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode loads"})
		return
	}

	resp := make([]models.DriverLoadResponse, 0, len(raw))
	for _, l := range raw {
		resp = append(resp, toDriverLoadResponse(l))
	}

	writePaginationHeaders(c, total, page, size)
	c.JSON(http.StatusOK, resp)
}

// GetMyLoad returns a single load assigned to the caller. Foreign-driver and
// cross-fleet attempts collapse to 404.
func GetMyLoad(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid load ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	var load models.Load
	err = database.GetLoadCollection().FindOne(ctx,
		bson.M{"_id": objID, "fleet_id": fleetID, "driver_id": userID},
	).Decode(&load)
	if errors.Is(err, mongo.ErrNoDocuments) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Load not found"})
		return
	}
	if err != nil {
		log.Printf("GetMyLoad: find failed driver=%s load=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch load"})
		return
	}

	c.JSON(http.StatusOK, toDriverLoadResponse(load))
}

// ----- shared transition handler --------------------------------------------

// TransitionLoad moves a load forward through the status state machine.
//
// Allowed transitions:
//
//	pending      -> in_progress  (sets started_at = now)
//	in_progress  -> complete     (sets completed_at = now)
//
// Any other transition (skip, backward, no-op) returns 409 Conflict.
//
// SECURITY: callable by either tier.
//   - Driver: filter additionally pins driver_id == userID; foreign assignment
//     collapses to 404 (no oracle).
//   - Owner:  filter pins fleet_id only; owner can drive any in-fleet load
//     through the same state machine.
//
// Timestamps are server-stamped with time.Now().UTC() — never accepted from
// client input.
func TransitionLoad(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")
	role := c.GetString("role")

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid load ID"})
		return
	}

	var req models.LoadStatusTransitionRequest
	if !decodeStrict(c, &req) {
		return
	}
	if err := validate.Struct(&req); err != nil {
		badRequest(c, err, "Invalid status")
		return
	}

	filter := bson.M{"_id": objID, "fleet_id": fleetID}
	if role != models.RoleOwner {
		filter["driver_id"] = userID
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetLoadCollection()

	var existing models.Load
	if err := col.FindOne(ctx, filter).Decode(&existing); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Load not found"})
			return
		}
		log.Printf("TransitionLoad: find failed user=%s load=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
		return
	}

	now := time.Now().UTC()
	set := bson.M{"updated_at": now}

	switch {
	case existing.Status == models.LoadStatusPending && req.Status == models.LoadStatusInProgress:
		set["status"] = models.LoadStatusInProgress
		set["started_at"] = now
	case existing.Status == models.LoadStatusInProgress && req.Status == models.LoadStatusComplete:
		set["status"] = models.LoadStatusComplete
		set["completed_at"] = now
	default:
		c.JSON(http.StatusConflict, gin.H{"error": "Invalid status transition"})
		return
	}

	if _, err := col.UpdateOne(ctx, filter, bson.M{"$set": set}); err != nil {
		log.Printf("TransitionLoad: update failed user=%s load=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update load"})
		return
	}

	var updated models.Load
	if err := col.FindOne(ctx, filter).Decode(&updated); err != nil {
		log.Printf("TransitionLoad: re-read failed user=%s load=%s: %v", userID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch load"})
		return
	}

	if role == models.RoleOwner {
		c.JSON(http.StatusOK, updated)
		return
	}
	c.JSON(http.StatusOK, toDriverLoadResponse(updated))
}
