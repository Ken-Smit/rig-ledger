package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Load status constants — the canonical strings used by the BSON status field,
// the validator oneof tag, and the LoadStatusTransitionRequest. Adding a new
// status (cancelled, rescheduled, etc.) is a state-machine change that must be
// reflected in TransitionLoad's transition table — do not add casually.
const (
	LoadStatusPending    = "pending"
	LoadStatusInProgress = "in_progress"
	LoadStatusComplete   = "complete"
)

// Stop kind constants. Every Stop is either a pickup or a dropoff. v1 does not
// model intermediate yard stops, fuel stops, or driver breaks — those are
// out-of-scope per the implementation plan.
const (
	StopKindPickup  = "pickup"
	StopKindDropoff = "dropoff"
)

// Stop is one waypoint of a Load: an address, a kind (pickup/dropoff), an
// ordering sequence, and a scheduled local time.
//
// Sequence is server-canonicalized on persistence (controller sorts by Sequence
// before insert/update) so out-of-order client input cannot leave the document
// with stops in the wrong driving order.
type Stop struct {
	Kind         string    `bson:"kind"                    json:"kind"                    validate:"required,oneof=pickup dropoff"`
	Sequence     int       `bson:"sequence"                json:"sequence"                validate:"gte=0"`
	Address      string    `bson:"address"                 json:"address"                 validate:"required,min=3,max=300"`
	City         string    `bson:"city,omitempty"          json:"city,omitempty"          validate:"omitempty,max=100"`
	State        string    `bson:"state,omitempty"         json:"state,omitempty"         validate:"omitempty,len=2"`
	Zip          string    `bson:"zip,omitempty"           json:"zip,omitempty"           validate:"omitempty,max=10"`
	ContactName  string    `bson:"contact_name,omitempty"  json:"contact_name,omitempty"  validate:"omitempty,max=120"`
	ContactPhone string    `bson:"contact_phone,omitempty" json:"contact_phone,omitempty" validate:"omitempty,max=30"`
	ScheduledAt  time.Time `bson:"scheduled_at"            json:"scheduled_at"            validate:"required"`
	Notes        string    `bson:"notes,omitempty"         json:"notes,omitempty"         validate:"omitempty,max=500"`
}

// Load is the persisted shape of an owner-assigned driver job.
//
// SECURITY:
//   - FleetID is the tenancy boundary. Every read/write filters on it; cross-
//     fleet attempts collapse to a 404 with no existence-oracle leak.
//   - DriverID identifies the assigned user. Driver-tier handlers also filter
//     on driver_id == JWT.userID so a driver cannot see or transition another
//     driver's load.
//   - StartedAt and CompletedAt are pointers and are ONLY set by the server
//     inside TransitionLoad. Clients never write timestamps directly.
//   - RateCents and CreatedBy are stripped from driver-tier responses by the
//     DriverLoadResponse projection (see loadController).
type Load struct {
	ID        bson.ObjectID `bson:"_id,omitempty"      json:"_id,omitempty"`
	FleetID   string        `bson:"fleet_id"           json:"fleet_id"`
	DriverID  string        `bson:"driver_id"          json:"driver_id"             validate:"required"`
	TruckID   string        `bson:"truck_id,omitempty" json:"truck_id,omitempty"`
	CreatedBy string        `bson:"created_by"         json:"created_by"`

	ReferenceNumber string `bson:"reference_number,omitempty" json:"reference_number,omitempty" validate:"omitempty,max=50"`
	Stops           []Stop `bson:"stops"                       json:"stops"                       validate:"required,min=2,dive"`

	// ScheduledPickupAt is denormalized from the earliest-sequence stop's
	// scheduled_at at write time. Indexed via (driver_id, status,
	// scheduled_pickup_at) so the driver "today / queue" view can sort + filter
	// without scanning the embedded stops array. Set exclusively by the
	// controller; never accepted from client input.
	ScheduledPickupAt time.Time `bson:"scheduled_pickup_at" json:"scheduled_pickup_at"`

	Status      string     `bson:"status"                  json:"status"                  validate:"required,oneof=pending in_progress complete"`
	StartedAt   *time.Time `bson:"started_at,omitempty"    json:"started_at,omitempty"`
	CompletedAt *time.Time `bson:"completed_at,omitempty"  json:"completed_at,omitempty"`

	RateCents     *int64  `bson:"rate_cents,omitempty"     json:"rate_cents,omitempty"     validate:"omitempty,min=0"`
	DistanceMiles *uint32 `bson:"distance_miles,omitempty" json:"distance_miles,omitempty"`
	Notes         string  `bson:"notes,omitempty"          json:"notes,omitempty"          validate:"omitempty,max=2000"`

	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// LoadCreateRequest is the inbound DTO for POST /loads (owner only).
//
// SECURITY: Identity fields (_id, fleet_id, created_by, status, started_at,
// completed_at, created_at, updated_at) are intentionally absent — they are
// server-managed and must never be settable by the client (mass-assignment
// defense). Adding a new field here exposes it to untrusted input.
type LoadCreateRequest struct {
	DriverID        string  `json:"driver_id"        validate:"required"`
	TruckID         string  `json:"truck_id"         validate:"omitempty"`
	ReferenceNumber string  `json:"reference_number" validate:"omitempty,max=50"`
	Stops           []Stop  `json:"stops"            validate:"required,min=2,dive"`
	RateCents       *int64  `json:"rate_cents"       validate:"omitempty,min=0"`
	DistanceMiles   *uint32 `json:"distance_miles"`
	Notes           string  `json:"notes"            validate:"omitempty,max=2000"`
}

// LoadUpdateRequest is the inbound DTO for PUT /loads/:id (owner only).
//
// Pointer fields distinguish "field omitted" from "field set to empty/zero" so
// the controller can build a $set document that touches only what the caller
// intended to change. Mirrors the UserProfileUpdate pattern.
//
// SECURITY: status and timestamp fields are deliberately absent — those move
// only through TransitionLoad, where the state machine is enforced server-side.
type LoadUpdateRequest struct {
	DriverID        *string `json:"driver_id"`
	TruckID         *string `json:"truck_id"`
	ReferenceNumber *string `json:"reference_number" validate:"omitempty,max=50"`
	Stops           *[]Stop `json:"stops"            validate:"omitempty,min=2,dive"`
	RateCents       *int64  `json:"rate_cents"       validate:"omitempty,min=0"`
	DistanceMiles   *uint32 `json:"distance_miles"`
	Notes           *string `json:"notes"            validate:"omitempty,max=2000"`
}

// LoadStatusTransitionRequest is the inbound DTO for POST /loads/:id/transition.
//
// Only forward transitions are allowed at the validator boundary; the handler
// additionally enforces the full state machine (pending → in_progress →
// complete) so a client cannot skip a step.
type LoadStatusTransitionRequest struct {
	Status string `json:"status" validate:"required,oneof=in_progress complete"`
}

// DriverLoadResponse is the projection returned to driver-tier handlers.
//
// SECURITY / PRIVACY: omits RateCents (fleet financials — pay agreements vary
// per driver and are not part of the driver-facing surface in v1) and
// CreatedBy (owner-side audit metadata). Mirrors the UserResponse pattern in
// userModel.go: never marshal a full domain model into a less-trusted view.
type DriverLoadResponse struct {
	ID              bson.ObjectID `json:"_id"`
	FleetID         string        `json:"fleet_id"`
	DriverID        string        `json:"driver_id"`
	TruckID         string        `json:"truck_id,omitempty"`
	ReferenceNumber   string        `json:"reference_number,omitempty"`
	Stops             []Stop        `json:"stops"`
	ScheduledPickupAt time.Time     `json:"scheduled_pickup_at"`
	Status            string        `json:"status"`
	StartedAt       *time.Time    `json:"started_at,omitempty"`
	CompletedAt     *time.Time    `json:"completed_at,omitempty"`
	DistanceMiles   *uint32       `json:"distance_miles,omitempty"`
	Notes           string        `json:"notes,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

// FleetDriverResponse is the projection returned by GET /fleet/drivers — the
// minimum shape needed to populate the assign-driver dropdown. Email and other
// PII are deliberately not surfaced; the dropdown only needs hex ID + name.
type FleetDriverResponse struct {
	UserID    string `json:"user_id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}