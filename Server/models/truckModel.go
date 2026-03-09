package models

import (
	"time"

	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TirePosition tracks an individual tire's position and condition
type TirePosition struct {
	Position   string  `bson:"position" json:"position"`       // e.g. "steer-left", "drive-1-outer-left"
	TreadDepth float32 `bson:"tread_depth" json:"tread_depth"` // in 32nds of an inch
	Brand      string  `bson:"brand,omitempty" json:"brand,omitempty"`
	Model      string  `bson:"model,omitempty" json:"model,omitempty"`
}

type Truck struct {
	ID     bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserID string        `bson:"user_id,omitempty" json:"user_id,omitempty"`

	// Identity
	Year       uint16 `bson:"year" json:"year" validate:"required,min=1900,truckyear"`
	Make       string `bson:"make" json:"make" validate:"required"`
	Model      string `bson:"model" json:"model" validate:"required"`
	VIN        string `bson:"vin,omitempty" json:"vin,omitempty"`
	UnitNumber string `bson:"unit_number,omitempty" json:"unit_number,omitempty"`

	// General Inspections
	AnnualInspectionDate string `bson:"annual_inspection_date,omitempty" json:"annual_inspection_date,omitempty"`
	BrakeInspectionDate  string `bson:"brake_inspection_date,omitempty" json:"brake_inspection_date,omitempty"`

	// Oil Service
	LastOilChangeMileage uint32 `bson:"last_oil_change_mileage,omitempty" json:"last_oil_change_mileage,omitempty"`
	LastOilChangeDate    string `bson:"last_oil_change_date,omitempty" json:"last_oil_change_date,omitempty"`
	OilChangeInterval    uint32 `bson:"oil_change_interval,omitempty" json:"oil_change_interval,omitempty"` // miles

	// Fluids
	CoolantFlushDate        string `bson:"coolant_flush_date,omitempty" json:"coolant_flush_date,omitempty"`
	TransmissionServiceDate string `bson:"transmission_service_date,omitempty" json:"transmission_service_date,omitempty"`

	// Tires
	TireSize             string         `bson:"tire_size,omitempty" json:"tire_size,omitempty"`
	NumberOfTires        uint8          `bson:"number_of_tires,omitempty" json:"number_of_tires,omitempty"`
	TireBrand            string         `bson:"tire_brand,omitempty" json:"tire_brand,omitempty"`
	TireModel            string         `bson:"tire_model,omitempty" json:"tire_model,omitempty"`
	LastTireRotationDate string         `bson:"last_tire_rotation_date,omitempty" json:"last_tire_rotation_date,omitempty"`
	TirePositions        []TirePosition `bson:"tire_positions,omitempty" json:"tire_positions,omitempty"`
}

// ValidateTruckYear ensures the truck year is not in the future
func ValidateTruckYear(fl validator.FieldLevel) bool {
	year := fl.Field().Uint()
	maxYear := uint64(time.Now().Year() + 1)
	return year <= maxYear
}
