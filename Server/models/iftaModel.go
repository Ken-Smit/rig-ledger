package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// IftaMiles is one logged trip segment: distance driven in a single IFTA
// jurisdiction on a given day by a given truck. The reporting quarter is
// derived from Date (YYYY-MM-DD), never stored, so a correction to the date
// automatically re-buckets the entry.
//
// SECURITY: FleetID is pinned server-side from the JWT and scopes every read
// and delete. A driver/owner can never see or remove another fleet's segments.
type IftaMiles struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	FleetID      string        `bson:"fleet_id,omitempty" json:"fleet_id,omitempty"`
	TruckID      string        `bson:"truck_id" json:"truck_id"`
	Date         string        `bson:"date" json:"date"`                 // YYYY-MM-DD
	Jurisdiction string        `bson:"jurisdiction" json:"jurisdiction"` // e.g. "TX"
	Miles        float64       `bson:"miles" json:"miles"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
}

// IftaFuel is one fuel purchase in a jurisdiction: gallons (the IFTA-relevant
// quantity) plus the dollar amount for the owner's own records.
type IftaFuel struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	FleetID      string        `bson:"fleet_id,omitempty" json:"fleet_id,omitempty"`
	TruckID      string        `bson:"truck_id" json:"truck_id"`
	Date         string        `bson:"date" json:"date"`
	Jurisdiction string        `bson:"jurisdiction" json:"jurisdiction"`
	Gallons      float64       `bson:"gallons" json:"gallons"`
	Amount       float64       `bson:"amount,omitempty" json:"amount,omitempty"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
}

// IftaMilesRequest / IftaFuelRequest are the inbound DTOs. They omit _id,
// fleet_id, and created_at — those are server-managed (mass-assignment
// defense).
type IftaMilesRequest struct {
	TruckID      string  `json:"truck_id"`
	Date         string  `json:"date"`
	Jurisdiction string  `json:"jurisdiction"`
	Miles        float64 `json:"miles"`
}

type IftaFuelRequest struct {
	TruckID      string  `json:"truck_id"`
	Date         string  `json:"date"`
	Jurisdiction string  `json:"jurisdiction"`
	Gallons      float64 `json:"gallons"`
	Amount       float64 `json:"amount"`
}

// IftaReturnLine is one jurisdiction's computed row on the quarterly return.
//
//   - TaxableGallons = Miles / fleet MPG (how much fuel that state's miles
//     "consumed" at the fleet's average economy).
//   - TaxOwed        = TaxableGallons * TaxRate.
//   - TaxPaid        = PurchasedGallons * TaxRate (tax already paid at the pump).
//   - Net            = TaxOwed - TaxPaid (positive = remit, negative = credit).
//   - Rated          = false when no published rate is known for the
//     jurisdiction (TaxOwed/TaxPaid/Net are then 0 and must not be filed as-is).
type IftaReturnLine struct {
	Jurisdiction     string  `json:"jurisdiction"`
	Miles            float64 `json:"miles"`
	PurchasedGallons float64 `json:"purchased_gallons"`
	TaxableGallons   float64 `json:"taxable_gallons"`
	TaxRate          float64 `json:"tax_rate"`
	TaxOwed          float64 `json:"tax_owed"`
	TaxPaid          float64 `json:"tax_paid"`
	Net              float64 `json:"net"`
	Rated            bool    `json:"rated"`
}

// IftaReturn is the computed quarterly summary returned to the SPA.
type IftaReturn struct {
	Year         int              `json:"year"`
	Quarter      int              `json:"quarter"`
	TotalMiles   float64          `json:"total_miles"`
	TotalGallons float64          `json:"total_gallons"`
	FleetMPG     float64          `json:"fleet_mpg"`
	NetTax       float64          `json:"net_tax"`
	Lines        []IftaReturnLine `json:"lines"`
}
