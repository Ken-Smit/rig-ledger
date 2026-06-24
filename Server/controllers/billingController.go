package controllers

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v82"
	portalsession "github.com/stripe/stripe-go/v82/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/webhook"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	envStripeSecret    = "STRIPE_SECRET_KEY"
	envStripeWebhook   = "STRIPE_WEBHOOK_SECRET"
	maxWebhookBodySize = 1 << 16 // 64 KB — Stripe events are small; cap to bound memory.
)

// stripeConfigured reports whether the secret key is present. When absent (dev
// without Stripe set up) billing endpoints degrade to a friendly 503 instead of
// panicking on an unauthenticated Stripe call.
func stripeConfigured() bool {
	return os.Getenv(envStripeSecret) != ""
}

// fleetEntitled reports whether a fleet currently has an access-granting
// subscription. Used at token-mint time (login / refresh / driver register) to
// stamp the `entitled` claim, which RequireEntitled enforces. Fail-safe: an
// empty/unknown fleet or any load error yields false (block, don't grant).
func fleetEntitled(ctx context.Context, fleetID string) bool {
	if fleetID == "" {
		return false
	}
	fleet, err := loadFleet(ctx, fleetID)
	if err != nil {
		log.Printf("fleetEntitled: load fleet failed fleet=%s: %v", fleetID, err)
		return false
	}
	// A redeemed promo (any bonus trucks) also grants full fleet access — the
	// promo unlocks the whole app for the owner and invited drivers without a
	// paid subscription.
	return entitledStatuses[fleet.SubscriptionStatus] || fleet.PromoBonusTrucks > 0
}

// loadFleet fetches the fleet referenced by the JWT's fleetID.
func loadFleet(ctx context.Context, fleetID string) (*models.Fleet, error) {
	objID, err := bson.ObjectIDFromHex(fleetID)
	if err != nil {
		return nil, err
	}
	var fleet models.Fleet
	if err := database.GetFleetCollection().FindOne(ctx, bson.M{"_id": objID}).Decode(&fleet); err != nil {
		return nil, err
	}
	return &fleet, nil
}

// ownerEmail returns the owner's email for the Stripe customer record (so the
// Stripe dashboard + receipts are addressable). Best-effort: a missing email is
// non-fatal, Stripe simply creates the customer without one. Projects email
// only — the bcrypt hash never leaves Mongo.
func ownerEmail(ctx context.Context, userID string) string {
	var u struct {
		Email string `bson:"email"`
	}
	opts := options.FindOne().SetProjection(bson.M{"email": 1})
	if err := database.GetUserCollection().FindOne(ctx, bson.M{"user_id": userID}, opts).Decode(&u); err != nil {
		return ""
	}
	return u.Email
}

// ensureStripeCustomer returns the fleet's Stripe customer ID, creating the
// customer (and persisting the ID on the fleet) on first use. The fleet ID is
// stamped into customer metadata so a customer can always be traced back to a
// tenant in the Stripe dashboard.
func ensureStripeCustomer(ctx context.Context, fleet *models.Fleet, email string) (string, error) {
	if fleet.StripeCustomerID != "" {
		return fleet.StripeCustomerID, nil
	}
	params := &stripe.CustomerParams{}
	if email != "" {
		params.Email = stripe.String(email)
	}
	params.AddMetadata("fleet_id", fleet.ID.Hex())

	cust, err := customer.New(params)
	if err != nil {
		return "", err
	}
	_, err = database.GetFleetCollection().UpdateOne(ctx,
		bson.M{"_id": fleet.ID},
		bson.M{"$set": bson.M{"stripe_customer_id": cust.ID}},
	)
	if err != nil {
		// The customer exists in Stripe but we failed to persist the link. Log
		// loudly — the next call will create a DUPLICATE customer otherwise.
		log.Printf("ensureStripeCustomer: persist link failed fleet=%s cust=%s: %v", fleet.ID.Hex(), cust.ID, err)
		return "", err
	}
	return cust.ID, nil
}

// CreateCheckoutSession starts a Stripe Checkout subscription for a tier and
// returns the hosted URL. Owner-only.
//
// Body: {"tier": "small_fleet"}. The tier must exist and have a configured
// Price ID; an unknown or unconfigured tier is a 400 / 503, never a charge.
func CreateCheckoutSession(c *gin.Context) {
	if !stripeConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Billing isn’t set up yet."})
		return
	}

	var body struct {
		Tier string `json:"tier"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, err, "Invalid request")
		return
	}
	if _, ok := tierByKey(body.Tier); !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown plan"})
		return
	}
	priceID := priceIDForTier(body.Tier)
	if priceID == "" {
		log.Printf("CreateCheckoutSession: price env empty for tier=%s", body.Tier)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "That plan isn’t available right now."})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	fleet, err := loadFleet(ctx, c.GetString("fleetID"))
	if err != nil {
		log.Printf("CreateCheckoutSession: load fleet failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t start checkout"})
		return
	}

	custID, err := ensureStripeCustomer(ctx, fleet, ownerEmail(ctx, c.GetString("userID")))
	if err != nil {
		log.Printf("CreateCheckoutSession: ensure customer failed fleet=%s: %v", fleet.ID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t start checkout"})
		return
	}

	base := appBaseURL()
	params := &stripe.CheckoutSessionParams{
		Mode:       stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		Customer:   stripe.String(custID),
		SuccessURL: stripe.String(base + "/billing?status=success"),
		CancelURL:  stripe.String(base + "/billing?status=cancel"),
		LineItems: []*stripe.CheckoutSessionLineItemParams{{
			Price:    stripe.String(priceID),
			Quantity: stripe.Int64(1),
		}},
	}

	// 7-day trial — once only. The card is collected now but not charged until
	// day 7; Stripe reports status "trialing", which our entitlement check
	// treats as full access. A fleet that has already consumed its trial (set by
	// the webhook the first time a sub is seen) resubscribes with no trial, so
	// cancel + resubscribe cannot mint unlimited free trials.
	if !fleet.TrialUsed {
		params.SubscriptionData = &stripe.CheckoutSessionSubscriptionDataParams{
			TrialPeriodDays: stripe.Int64(trialPeriodDays),
		}
	}

	s, err := checkoutsession.New(params)
	if err != nil {
		log.Printf("CreateCheckoutSession: stripe create failed fleet=%s: %v", fleet.ID.Hex(), err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Couldn’t start checkout"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": s.URL})
}

// CreatePortalSession opens the Stripe Customer Portal for self-serve plan
// changes, payment-method updates, and cancellation. Owner-only.
func CreatePortalSession(c *gin.Context) {
	if !stripeConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Billing isn’t set up yet."})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	fleet, err := loadFleet(ctx, c.GetString("fleetID"))
	if err != nil {
		log.Printf("CreatePortalSession: load fleet failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t open billing"})
		return
	}
	if fleet.StripeCustomerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No billing account yet — subscribe to a plan first."})
		return
	}

	ps, err := portalsession.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(fleet.StripeCustomerID),
		ReturnURL: stripe.String(appBaseURL() + "/billing"),
	})
	if err != nil {
		log.Printf("CreatePortalSession: stripe create failed fleet=%s: %v", fleet.ID.Hex(), err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Couldn’t open billing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": ps.URL})
}

// GetSubscription returns the fleet's current plan state + truck usage so the
// SPA can render the billing page and an "X / Y trucks" meter. Owner-only.
func GetSubscription(c *gin.Context) {
	ctx, cancel := dbCtx(c)
	defer cancel()

	fleetID := c.GetString("fleetID")
	fleet, err := loadFleet(ctx, fleetID)
	if err != nil {
		log.Printf("GetSubscription: load fleet failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t load billing"})
		return
	}

	truckCount, err := database.GetTruckCollection().CountDocuments(ctx, bson.M{"fleet_id": fleetID})
	if err != nil {
		log.Printf("GetSubscription: truck count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t load billing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         fleet.SubscriptionStatus,
		"tier":           fleet.SubscriptionTier,
		"truck_limit":    fleetTruckLimit(fleet.SubscriptionStatus, fleet.SubscriptionTier, fleet.PromoBonusTrucks > 0),
		"truck_count":    truckCount,
		"promo_redeemed": fleet.PromoCodeRedeemed != "",
	})
}

// RedeemPromo applies a promo code to the caller's fleet. The only code today
// grants +1 truck of capacity (promoBonusTrucks), stacked on top of the plan's
// band. Owner-only; mounted in the billing group so it is reachable regardless
// of subscription state.
//
// ponytail: code is intentionally multi-use for now — each redeem stacks
// another +1 truck. Re-add the single-use guard (fleet.PromoCodeRedeemed ==
// code -> 409) before launch if codes should be one-per-fleet.
func RedeemPromo(c *gin.Context) {
	var body struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, err, "Invalid request")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(body.Code))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a promo code"})
		return
	}
	if code != freeTruckPromoCode() {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "That promo code isn’t valid."})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	fleetID := c.GetString("fleetID")
	fleet, err := loadFleet(ctx, fleetID)
	if err != nil {
		log.Printf("RedeemPromo: load fleet failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t apply promo code"})
		return
	}

	_, err = database.GetFleetCollection().UpdateOne(ctx,
		bson.M{"_id": fleet.ID},
		bson.M{
			"$inc": bson.M{"promo_bonus_trucks": promoBonusTrucks},
			"$set": bson.M{"promo_code_redeemed": code},
		},
	)
	if err != nil {
		log.Printf("RedeemPromo: update failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn’t apply promo code"})
		return
	}

	// Re-mint the access token with entitled=true and refresh the cookie so the
	// promo unlocks the app IMMEDIATELY — the caller's current token still says
	// entitled=false until it expires otherwise. The fleet now has a promo bonus,
	// so fleetEntitled is true; pass it explicitly. Non-fatal on failure: the
	// bonus is already persisted and the next token refresh will pick it up.
	if access, mintErr := utils.GenerateAccessToken(c.GetString("userID"), c.GetString("role"), fleetID, true); mintErr == nil {
		utils.SetAccessTokenCookie(c, access)
	} else {
		log.Printf("RedeemPromo: re-mint token failed fleet=%s: %v", fleetID, mintErr)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Promo applied — 1 free truck added and your fleet is unlocked.",
		"truck_limit": fleetTruckLimit(fleet.SubscriptionStatus, fleet.SubscriptionTier, true),
	})
}

// HandleStripeWebhook is the ONLY writer of subscription entitlement. It is
// unauthenticated (Stripe calls it) but every event is verified against the
// signing secret using the exact raw body — a forged or replayed-tampered
// payload fails ConstructEvent and is rejected.
//
// SECURITY: never trust the parsed JSON before ConstructEvent succeeds. The
// fleet is located by the Stripe customer ID we stored at customer creation, so
// the event can only ever move a tenant we already linked.
func HandleStripeWebhook(c *gin.Context) {
	secret := os.Getenv(envStripeWebhook)
	if secret == "" {
		log.Printf("HandleStripeWebhook: %s not configured; rejecting", envStripeWebhook)
		c.Status(http.StatusServiceUnavailable)
		return
	}

	payload, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBodySize))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	event, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), secret)
	if err != nil {
		// Bad signature = not from Stripe (or tampered). Do not process.
		log.Printf("HandleStripeWebhook: signature verification failed: %v", err)
		c.Status(http.StatusBadRequest)
		return
	}

	switch event.Type {
	case "customer.subscription.created",
		"customer.subscription.updated",
		"customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Printf("HandleStripeWebhook: decode subscription failed: %v", err)
			c.Status(http.StatusBadRequest)
			return
		}
		// On a Mongo write failure return 5xx so Stripe RETRIES — otherwise the
		// fleet's entitlement silently desyncs from the true subscription state.
		// "no fleet matched that customer" is NOT a write failure (returns nil),
		// so it is acknowledged with 200 and Stripe stops retrying.
		if err := applySubscription(c.Request.Context(), &sub, string(event.Type), event.Created); err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
	default:
		// Unhandled event types are acknowledged so Stripe stops retrying.
	}

	c.Status(http.StatusOK)
}

// applySubscription writes the subscription's status + tier onto the matching
// fleet. On delete it marks the fleet canceled and clears the tier (dropping it
// back to the free-trial truck limit).
//
// eventType is the Stripe event type; eventCreated is event.Created (unix
// seconds) used as an out-of-order guard: Stripe does not guarantee delivery
// order, so the write only applies when eventCreated >= the fleet's stored
// watermark (or the field is missing). Re-applying the same event is a no-op on
// state but is reported as success (idempotent for Stripe retries).
//
// Returns a non-nil error ONLY for a Mongo write failure — the caller turns
// that into a 5xx so Stripe retries. A missing customer or "no fleet matched"
// is NOT retriable and returns nil (acknowledged with 200).
func applySubscription(parent context.Context, sub *stripe.Subscription, eventType string, eventCreated int64) error {
	if sub.Customer == nil || sub.Customer.ID == "" {
		log.Printf("applySubscription: subscription %s has no customer", sub.ID)
		return nil
	}

	deleted := eventType == "customer.subscription.deleted"

	set := bson.M{
		"stripe_subscription_id": sub.ID,
		"subscription_status":    string(sub.Status),
		"subscription_event_at":  eventCreated, // advance the watermark
	}
	if deleted {
		set["subscription_status"] = "canceled"
		set["subscription_tier"] = ""
	} else {
		// Map the subscription's price back to our tier. An unknown price (e.g.
		// a Stripe Price created outside our table) leaves the tier untouched
		// rather than guessing.
		if sub.Items != nil && len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
			if tier, ok := tierForPriceID(sub.Items.Data[0].Price.ID); ok {
				set["subscription_tier"] = tier.Key
			} else {
				log.Printf("applySubscription: unknown price %s on sub %s", sub.Items.Data[0].Price.ID, sub.ID)
			}
		}
		// First time we see this fleet on an entitled (trialing/active) sub, burn
		// its one free trial so a later resubscribe gets no trial. Once true it
		// stays true (we never unset it), so this is safe under retries.
		if entitledStatuses[string(sub.Status)] {
			set["trial_used"] = true
		}
	}

	// Out-of-order guard: only apply when this event is newer-or-equal to what
	// we last applied. The OR on a missing field handles fleets written before
	// the watermark existed. ">=" (not ">") keeps retries of the SAME event
	// idempotent — they still match the filter and re-write identical state.
	filter := bson.M{
		"stripe_customer_id": sub.Customer.ID,
		"$or": []bson.M{
			{"subscription_event_at": bson.M{"$lte": eventCreated}},
			{"subscription_event_at": bson.M{"$exists": false}},
		},
	}

	ctx, cancel := context.WithTimeout(parent, dbTimeout)
	defer cancel()

	res, err := database.GetFleetCollection().UpdateOne(ctx, filter, bson.M{"$set": set})
	if err != nil {
		// Retriable: surface to the caller so Stripe redelivers and we converge.
		log.Printf("applySubscription: update failed cust=%s sub=%s: %v", sub.Customer.ID, sub.ID, err)
		return err
	}
	if res.MatchedCount == 0 {
		// Either no fleet for this customer, or a stale (older) event the guard
		// rejected. Neither is retriable — acknowledge so Stripe stops.
		log.Printf("applySubscription: no fleet matched (stale event or unknown customer) cust=%s sub=%s event_created=%d", sub.Customer.ID, sub.ID, eventCreated)
	}
	return nil
}

// InitStripe wires the secret key into the SDK at startup. No-op when unset so
// dev without Stripe configured still boots. Called from main.
func InitStripe() {
	if key := strings.TrimSpace(os.Getenv(envStripeSecret)); key != "" {
		stripe.Key = key
	}
}
