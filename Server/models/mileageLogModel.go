package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// MileageLog is a per-truck, per-day odometer record submitted by drivers.
//
// Date is the canonical YYYY-MM-DD calendar string (len=10) so that records
// from drivers in different time zones don't accidentally collide on the same
// instant. The (FleetID, TruckID, Date) tuple is unique — the controller
// upserts on this key so a driver can amend a same-day entry without creating
// duplicates.
//
// StartMileage / EndMileage are pointer types so the model can distinguish
// "not yet logged" (nil) from "logged as 0" (a legitimate, if unusual, value).
// uint32 caps at ~4.29B miles, well beyond any real odometer ceiling.
//
// DriverID records who submitted the entry for accountability — the owner can
// see who logged what without trusting client-supplied attribution.
type MileageLog struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	FleetID      string        `bson:"fleet_id" json:"fleet_id"`
	TruckID      string        `bson:"truck_id" json:"truck_id" validate:"required"`
	DriverID     string        `bson:"driver_id" json:"driver_id"`
	Date         string        `bson:"date" json:"date" validate:"required,len=10"`
	StartMileage *uint32       `bson:"start_mileage,omitempty" json:"start_mileage,omitempty"`
	EndMileage   *uint32       `bson:"end_mileage,omitempty" json:"end_mileage,omitempty"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at" json:"updated_at"`
}

// MileageLogUpsertRequest is the request DTO for POST/PUT mileage entries.
//
// Pointers on the mileage fields mirror the persisted model so a request can
// patch only StartMileage or only EndMileage without clobbering the other.
type MileageLogUpsertRequest struct {
	TruckID      string  `json:"truck_id" validate:"required"`
	Date         string  `json:"date" validate:"required,len=10"`
	StartMileage *uint32 `json:"start_mileage" validate:"omitempty"`
	EndMileage   *uint32 `json:"end_mileage" validate:"omitempty"`
}
