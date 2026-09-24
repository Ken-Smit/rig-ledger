package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// DutyStatus is the FMCSA duty-status of a driver during an interval.
//
// The four values mirror 49 CFR §395.8's record-of-duty-status grid lines:
// off-duty, sleeper berth, driving, and on-duty-not-driving.
type DutyStatus string

// The four legal duty statuses. Stored as short lowercase tokens so the wire
// payload stays lean for drivers on slow mobile connections.
const (
	DutyOff     DutyStatus = "off"
	DutySleeper DutyStatus = "sleeper"
	DutyDriving DutyStatus = "driving"
	DutyOnDuty  DutyStatus = "onduty"
)

// DutyStatusLog is a single duty-status change a driver logs about themselves.
//
// One document marks the instant a status BEGAN (ChangedAt). The compliance
// engine reconstructs intervals by pairing each log with the next one in time,
// so a log is a transition point, not a span.
//
// DriverID is the JWT subject — every log belongs to the user who created it.
// FleetID is the tenancy boundary, pinned server-side from the JWT. Neither is
// ever accepted from client input. TruckID is optional; when present it is
// asserted in-fleet at write time.
type DutyStatusLog struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	FleetID   string        `bson:"fleet_id" json:"fleet_id"`
	DriverID  string        `bson:"driver_id" json:"driver_id"`
	TruckID   string        `bson:"truck_id,omitempty" json:"truck_id,omitempty"`
	Status    DutyStatus    `bson:"status" json:"status" validate:"required,oneof=off sleeper driving onduty"`
	ChangedAt time.Time     `bson:"changed_at" json:"changed_at"`
	Location  string        `bson:"location,omitempty" json:"location,omitempty"`
	Note      string        `bson:"note,omitempty" json:"note,omitempty"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}

// DutyStatusLogRequest is the inbound DTO for POST /hos/logs.
//
// ChangedAt is a pointer so the server can distinguish "omitted" (default to
// now) from a client-supplied instant. Location/Note are length-capped at the
// validator to bound the document size. Server-managed identity fields
// (ID/FleetID/DriverID/CreatedAt) are deliberately absent so they cannot be
// mass-assigned from the wire.
type DutyStatusLogRequest struct {
	Status    DutyStatus `json:"status" validate:"required,oneof=off sleeper driving onduty"`
	ChangedAt *time.Time `json:"changed_at" validate:"omitempty"`
	TruckID   string     `json:"truck_id" validate:"omitempty"`
	Location  string     `json:"location" validate:"omitempty,max=120"`
	Note      string     `json:"note" validate:"omitempty,max=300"`
}
