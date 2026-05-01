package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Fleet is the tenancy boundary for Rig Ledger.
//
// Every truck, expense, mileage log, and invite hangs off a Fleet via FleetID.
// Owners create exactly one fleet at registration (the migration backfills one
// for legacy users). Drivers are attached to an existing fleet via invite —
// they never create one. OwnerID is the User.ID hex of the owning operator and
// is the only User.ID with mutate authority on this fleet's documents.
//
// SECURITY: OwnerID is the source of truth for "who can manage this fleet."
// Authorization checks must compare the JWT's userID against Fleet.OwnerID
// before any owner-only mutation. Never trust a client-supplied owner_id.
type Fleet struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	OwnerID   string        `bson:"owner_id" json:"owner_id"` // owner User.ID hex
	Name      string        `bson:"name" json:"name"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}
