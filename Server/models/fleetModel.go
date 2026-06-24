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

	// Billing — populated by Stripe. The customer + subscription IDs are
	// internal plumbing and never leave the server (json:"-"). Status and Tier
	// are the entitlement state the SPA reads to render the plan and gate UI;
	// they are written ONLY from signature-verified Stripe webhook events, never
	// from client input.
	StripeCustomerID     string `bson:"stripe_customer_id,omitempty" json:"-"`
	StripeSubscriptionID string `bson:"stripe_subscription_id,omitempty" json:"-"`
	SubscriptionStatus   string `bson:"subscription_status,omitempty" json:"subscription_status,omitempty"` // active|trialing|past_due|canceled|""
	SubscriptionTier     string `bson:"subscription_tier,omitempty" json:"subscription_tier,omitempty"`     // billingTier.Key

	// SubscriptionEventAt is the Stripe event.Created (unix seconds) of the most
	// recent webhook applied to this fleet. Stripe does not guarantee delivery
	// order, so the webhook writer only applies an event whose timestamp is >=
	// this watermark — preventing a stale "updated" from clobbering a newer
	// "canceled". Internal plumbing, never leaves the server (json:"-").
	SubscriptionEventAt int64 `bson:"subscription_event_at,omitempty" json:"-"`

	// TrialUsed is set true the first time this fleet is observed on a
	// trialing/active subscription. CreateCheckoutSession omits the 7-day trial
	// once this is set, so a fleet cannot cancel + resubscribe for unlimited
	// fresh trials. Internal plumbing, never leaves the server (json:"-").
	TrialUsed bool `bson:"trial_used,omitempty" json:"-"`

	// PromoBonusTrucks is extra truck capacity granted by redeemed promo codes,
	// added on top of the subscription tier's band. PromoCodeRedeemed records the
	// last code redeemed and blocks re-redeeming the same one (one bonus per
	// code per fleet). Set server-side only, from the validated redeem endpoint.
	PromoBonusTrucks int    `bson:"promo_bonus_trucks,omitempty" json:"-"`
	PromoCodeRedeemed string `bson:"promo_code_redeemed,omitempty" json:"-"`
}
