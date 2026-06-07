package controllers

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// inviteListing is the safe projection shape for GetInvites. Mirrors
// models.Invite EXCEPT it has no TokenHash field — owners listing their
// fleet's invites must never see the storage form of the token, even though
// it is hashed (showing the hash invites confusion about what is sensitive).
type inviteListing struct {
	ID         bson.ObjectID `bson:"_id" json:"_id"`
	FleetID    string        `bson:"fleet_id" json:"fleet_id"`
	CreatedBy  string        `bson:"created_by" json:"created_by"`
	Email      string        `bson:"email,omitempty" json:"email,omitempty"`
	ExpiresAt  time.Time     `bson:"expires_at" json:"expires_at"`
	ConsumedAt *time.Time    `bson:"consumed_at,omitempty" json:"consumed_at,omitempty"`
	CreatedAt  time.Time     `bson:"created_at" json:"created_at"`
}

// CreateInvite mints a new single-use invite for the caller's fleet.
//
// SECURITY: fleet_id and created_by are pinned from the JWT context, never
// from the request body. The returned raw token is shown to the inviter
// EXACTLY ONCE — it is not persisted, not logged, and never returned again.
// expires_at uses models.InviteTTL (7 days) and is auto-reaped by the Mongo
// TTL index.
func CreateInvite(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	userID := c.GetString("userID")
	if fleetID == "" || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req models.InviteCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Invalid invite request")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, "Please provide a valid email address")
		return
	}

	rawToken, tokenHash, err := utils.GenerateSecureToken()
	if err != nil {
		log.Printf("CreateInvite: token generation failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invite"})
		return
	}

	now := time.Now()
	invite := models.Invite{
		ID:        bson.NewObjectID(),
		FleetID:   fleetID,
		CreatedBy: userID,
		Email:     req.Email,
		TokenHash: tokenHash,
		ExpiresAt: now.Add(models.InviteTTL),
		CreatedAt: now,
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetInviteCollection()
	if _, err := col.InsertOne(ctx, invite); err != nil {
		log.Printf("CreateInvite: insert failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invite"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"invite_id":  invite.ID.Hex(),
		"token":      rawToken,
		"expires_at": invite.ExpiresAt,
	})
}

// GetInvites lists invites for the caller's fleet, newest-first.
//
// SECURITY: token_hash is deliberately excluded from the projection so the
// storage form of an invite credential never leaves the database — even
// though SHA-256 hashes are not directly redeemable, exposing them widens the
// attack surface for nothing.
func GetInvites(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	if fleetID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetInviteCollection()

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetProjection(bson.M{
			"_id":         1,
			"fleet_id":    1,
			"created_by":  1,
			"email":       1,
			"expires_at":  1,
			"consumed_at": 1,
			"created_at":  1,
		})

	cursor, err := col.Find(ctx, bson.M{"fleet_id": fleetID}, opts)
	if err != nil {
		log.Printf("GetInvites: find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invites"})
		return
	}
	defer cursor.Close(ctx)

	invites := []inviteListing{}
	if err := cursor.All(ctx, &invites); err != nil {
		log.Printf("GetInvites: decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode invites"})
		return
	}

	c.JSON(http.StatusOK, invites)
}

// DeleteInvite revokes an invite the caller's fleet owns.
//
// Filtering on (_id, fleet_id) means a revoke against another fleet's invite
// matches zero documents and returns 404 — same existence-oracle defense as
// the truck/expense delete paths.
func DeleteInvite(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	if fleetID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invite ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	col := database.GetInviteCollection()

	result, err := col.DeleteOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID})
	if err != nil {
		log.Printf("DeleteInvite: delete failed fleet=%s invite=%s: %v", fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete invite"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Invite deleted"})
}

// LookupInvite is the UNPROTECTED handler that powers the driver onboarding
// landing page: a recipient pastes their invite token and we tell them the
// fleet name + (optional) pinned email so they know what they are joining.
//
// SECURITY:
//   - Rate-limited at the route layer (AuthRateLimiter) to throttle token
//     guessing.
//   - Looks up by token_hash; the raw token never leaves the request scope
//     and is not logged.
//   - "missing", "expired", and "consumed" all collapse into a single
//     generic 404 — no enumeration oracle for valid invite tokens.
//   - A missing fleet (impossible under normal operation) also returns 404
//     so a half-deleted tenant cannot be probed.
func LookupInvite(c *gin.Context) {
	rawToken := c.Query("token")
	if rawToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing invite token"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	inviteCol := database.GetInviteCollection()
	var invite models.Invite
	err := inviteCol.FindOne(ctx, bson.M{"token_hash": utils.HashToken(rawToken)}).Decode(&invite)
	if err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("LookupInvite: invite lookup failed: %v", err)
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}
	if invite.ConsumedAt != nil || time.Now().After(invite.ExpiresAt) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}

	fleetObjID, err := bson.ObjectIDFromHex(invite.FleetID)
	if err != nil {
		log.Printf("LookupInvite: invite has malformed fleet_id invite=%s: %v", invite.ID.Hex(), err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}

	fleetCol := database.GetFleetCollection()
	var fleet models.Fleet
	fleetOpts := options.FindOne().SetProjection(bson.M{"name": 1})
	err = fleetCol.FindOne(ctx, bson.M{"_id": fleetObjID}, fleetOpts).Decode(&fleet)
	if err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("LookupInvite: fleet lookup failed invite=%s fleet=%s: %v", invite.ID.Hex(), invite.FleetID, err)
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"fleet_name": fleet.Name,
		"email":      invite.Email,
	})
}
