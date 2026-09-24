package controllers

import (
	"os"
	"strings"
)

// billingTier is one subscription plan. The truck band is enforced server-side
// on CreateTruck; the Stripe Price ID is read from an env var so dev / staging /
// prod can point at different Stripe Prices without code changes.
//
// SECURITY: the band is the entitlement boundary. Never trust a client-supplied
// tier for access decisions — the tier is set ONLY from Stripe webhook events,
// which are signature-verified.
type billingTier struct {
	Key       string // stable identifier stored on the fleet + sent by the SPA
	Label     string // human label for the SPA
	MinTrucks int
	MaxTrucks int
	PriceEnv  string // env var holding the Stripe Price ID
}

// billingTiers is the canonical plan table. Order = display order.
var billingTiers = []billingTier{
	{Key: "owner_op", Label: "Owner-Operator", MinTrucks: 1, MaxTrucks: 2, PriceEnv: "STRIPE_PRICE_OWNER_OP"},
	{Key: "small_fleet", Label: "Small Fleet", MinTrucks: 3, MaxTrucks: 7, PriceEnv: "STRIPE_PRICE_SMALL_FLEET"},
	{Key: "fleet", Label: "Fleet", MinTrucks: 8, MaxTrucks: 20, PriceEnv: "STRIPE_PRICE_FLEET"},
	{Key: "fleet_plus", Label: "Fleet+", MinTrucks: 21, MaxTrucks: 50, PriceEnv: "STRIPE_PRICE_FLEET_PLUS"},
}

// unsubscribedTruckLimit is what a fleet with no active/trialing subscription
// may register. Zero: real-account access is gated behind starting the 7-day
// trial (card required at Checkout, status "trialing" counts as entitled). The
// public /demo screen is the no-signup taster.
const unsubscribedTruckLimit = 0

// trialPeriodDays is the card-required free trial length applied at Checkout.
const trialPeriodDays = 7

// promoBonusTrucks is the extra truck capacity granted per redeemed promo code.
const promoBonusTrucks = 1

// promoTruckLimit is the TOTAL trucks a promo-only fleet (redeemed a code but
// has no paid subscription) may register — a hard cap of 1, regardless of how
// many times the code was redeemed.
const promoTruckLimit = 1

// fleetTruckLimit is the single source of truth for how many trucks a fleet may
// register. A paid/trialing subscription gets its tier band; a promo-only fleet
// is capped at promoTruckLimit (1); everyone else gets unsubscribedTruckLimit.
func fleetTruckLimit(status, tier string, promoActive bool) int {
	if entitledStatuses[status] {
		return truckLimitFor(status, tier)
	}
	if promoActive {
		return promoTruckLimit
	}
	return unsubscribedTruckLimit
}

// defaultFreeTruckPromo is the built-in "1 free truck" code. Overridable via
// the PROMO_CODE_FREE_TRUCK env var so it can be rotated without a redeploy.
const defaultFreeTruckPromo = "RIG-TRUCK-E90CFC"

// freeTruckPromoCode returns the active "1 free truck" promo code (upper-cased
// for case-insensitive matching).
func freeTruckPromoCode() string {
	if v := os.Getenv("PROMO_CODE_FREE_TRUCK"); v != "" {
		return strings.ToUpper(strings.TrimSpace(v))
	}
	return defaultFreeTruckPromo
}

// entitledStatuses are the Stripe subscription statuses that grant plan access.
// past_due is deliberately excluded: a failed payment should not keep unlocking
// new capacity. Stripe's dunning + the customer portal handle recovery.
var entitledStatuses = map[string]bool{
	"active":   true,
	"trialing": true,
}

func tierByKey(key string) (billingTier, bool) {
	for _, t := range billingTiers {
		if t.Key == key {
			return t, true
		}
	}
	return billingTier{}, false
}

// priceIDForTier resolves a tier's configured Stripe Price ID (or "" if unset).
func priceIDForTier(key string) string {
	t, ok := tierByKey(key)
	if !ok {
		return ""
	}
	return os.Getenv(t.PriceEnv)
}

// tierForPriceID reverse-maps a Stripe Price ID back to a tier. Used by the
// webhook to translate the subscription's price into our stored tier key.
func tierForPriceID(priceID string) (billingTier, bool) {
	if priceID == "" {
		return billingTier{}, false
	}
	for _, t := range billingTiers {
		if os.Getenv(t.PriceEnv) == priceID {
			return t, true
		}
	}
	return billingTier{}, false
}

// truckLimitFor returns how many trucks a fleet may register given its stored
// subscription status + tier. Unentitled fleets get the free-trial limit.
func truckLimitFor(status, tierKey string) int {
	if !entitledStatuses[status] {
		return unsubscribedTruckLimit
	}
	if t, ok := tierByKey(tierKey); ok {
		return t.MaxTrucks
	}
	return unsubscribedTruckLimit
}
