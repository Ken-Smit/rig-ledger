package controllers

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// userProfileProjection is a narrow read shape for GetUserProfile.
// We project to these fields server-side so the bcrypt hash and refresh
// token never traverse the wire from MongoDB into application memory.
//
// Role + FleetID are included so the frontend can render role-aware UI
// without a second round-trip. They are non-secret to the owning session
// (the same values already ride in the access token).
//
// UserID on the wire is _id.Hex() — that string is the canonical user
// identifier across the rest of the API surface (JWT.userID claim, load
// driver_id, FleetDriverResponse.UserID). The user document carries an
// optional denormalized `user_id` BSON field that is no longer authoritative
// and may be empty on records created before this projection landed.
type userProfileProjection struct {
	ID        bson.ObjectID `bson:"_id"`
	FirstName string        `bson:"first_name"`
	LastName  string        `bson:"last_name"`
	Email     string        `bson:"email"`
	Role      string        `bson:"role"`
	FleetID   string        `bson:"fleet_id"`
}

// GetUserProfile returns the authenticated user's profile fields.
//
// PERFORMANCE / SECURITY: uses a Mongo projection so the bcrypt hash and
// refresh token never leave the database. CLAUDE.md: "never fetch a full
// document when you only need 3 fields."
func GetUserProfile(c *gin.Context) {
	userID := c.GetString("userID") // extracted by JWT middleware

	objID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		// JWT carried a malformed subject — generic message, detail server-side.
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	opts := options.FindOne().SetProjection(bson.M{
		"_id":        1,
		"first_name": 1,
		"last_name":  1,
		"email":      1,
		"role":       1,
		"fleet_id":   1,
	})

	var profile userProfileProjection
	err = userCollection.FindOne(ctx, bson.M{"_id": objID}, opts).Decode(&profile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, models.UserResponse{
		UserID:    profile.ID.Hex(),
		FirstName: profile.FirstName,
		LastName:  profile.LastName,
		Email:     profile.Email,
		Role:      profile.Role,
		FleetID:   profile.FleetID,
	})
}

// UpdateUserProfile applies a strictly-scoped patch to the authenticated user's profile.
//
// SECURITY:
//   - Binds to models.UserProfileUpdate (allow-listed DTO), NOT models.User.
//     This prevents mass-assignment attacks where a caller could overwrite
//     password, email, refresh_token, _id, user_id, or created_at.
//   - Decodes with DisallowUnknownFields so any extra JSON key — including a
//     forgotten future-sensitive field — produces a 400 instead of being
//     silently ignored. Chosen over a reflection-tag scan because it is a
//     stdlib guarantee with no custom code to maintain.
//   - Builds the $set document explicitly from non-nil pointer fields, so a
//     field the client did not send is never touched in the database.
//   - The Mongo filter pins _id to the JWT subject; a forged or guessed
//     ObjectID in the request body cannot redirect the update.
//
// TODO(security): email change requires verification flow
// TODO(security): password change requires current-password re-auth + bcrypt rehash
func UpdateUserProfile(c *gin.Context) {
	userID := c.GetString("userID")

	objID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		// JWT carried a malformed subject — generic message, detail server-side.
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	update, ok := decodeProfileUpdate(c)
	if !ok {
		return // decodeProfileUpdate already wrote the response
	}

	setDoc := buildProfileSetDoc(update)
	if len(setDoc) == 1 { // only updated_at, no real fields provided
		c.JSON(http.StatusBadRequest, gin.H{"error": "No updatable fields provided"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	_, err = userCollection.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{"$set": setDoc})
	if err != nil {
		log.Printf("UpdateUserProfile: update failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User updated successfully"})
}

// decodeProfileUpdate strictly decodes and validates the profile update body.
// Writes the appropriate 4xx response and returns ok=false on any failure.
//
// Uses the package-wide validate instance (declared in truckController.go).
// Strict decoding (unknown-field + trailing-garbage rejection) is delegated to
// decodeStrict so the mass-assignment defense lives in one place.
func decodeProfileUpdate(c *gin.Context) (models.UserProfileUpdate, bool) {
	var update models.UserProfileUpdate
	if !decodeStrict(c, &update) {
		return update, false
	}
	if err := validate.Struct(update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed"})
		return update, false
	}
	return update, true
}

// buildProfileSetDoc assembles a $set document from non-nil DTO fields only.
// updated_at is always included so the audit timestamp advances on any write.
func buildProfileSetDoc(u models.UserProfileUpdate) bson.M {
	set := bson.M{"updated_at": time.Now()}
	if u.FirstName != nil {
		set["first_name"] = *u.FirstName
	}
	if u.LastName != nil {
		set["last_name"] = *u.LastName
	}
	return set
}

// DeleteUser removes the authenticated user's account with role-aware cleanup
// so deletion never orphans fleet data.
//
//   - Owner: blocked while a subscription is active/trialing or while other
//     members remain in the fleet (the owner must cancel + remove drivers
//     first — an explicit teardown for an irreversible, financially-relevant
//     action). Once clear, the fleet and EVERY fleet-scoped collection are
//     cascaded, then the user.
//   - Driver: their loads are unassigned (driver_id cleared; non-complete
//     loads reset to pending so the owner can reassign), then the user.
//
// SECURITY: every write is scoped to the caller's own fleet_id / user_id from
// the JWT context — a deletion can never reach another tenant's data.
func DeleteUser(c *gin.Context) {
	userID := c.GetString("userID")
	fleetID := c.GetString("fleetID")
	role := c.GetString("role")

	objID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	if role == models.RoleOwner {
		if ok := teardownOwnerFleet(c, ctx, objID, fleetID); !ok {
			return // teardownOwnerFleet already wrote the response
		}
	} else {
		// Driver: unassign their loads so none point at a deleted user.
		// Completed loads keep their historical driver_id for the record.
		_, err = database.GetLoadCollection().UpdateMany(ctx,
			bson.M{"fleet_id": fleetID, "driver_id": userID, "status": bson.M{"$ne": models.LoadStatusComplete}},
			bson.M{"$set": bson.M{"driver_id": "", "status": models.LoadStatusPending}},
		)
		if err != nil {
			log.Printf("DeleteUser: unassign loads failed user=%s fleet=%s: %v", userID, fleetID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
			return
		}
	}

	if _, err = database.GetUserCollection().DeleteOne(ctx, bson.M{"_id": objID}); err != nil {
		log.Printf("DeleteUser: delete failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Account deleted"})
}

// teardownOwnerFleet validates an owner can be deleted and, if so, cascades the
// fleet + all fleet-scoped collections. Returns false (and writes the HTTP
// response) when deletion is blocked or a cascade step fails; true when the
// fleet has been fully torn down and the caller may delete the user.
func teardownOwnerFleet(c *gin.Context, ctx context.Context, ownerObjID bson.ObjectID, fleetID string) bool {
	fleet, err := loadFleet(ctx, fleetID)
	if err != nil {
		log.Printf("DeleteUser: load fleet failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return false
	}

	// Block while billing is live so a paid subscription is never left dangling.
	if entitledStatuses[fleet.SubscriptionStatus] {
		c.JSON(http.StatusConflict, gin.H{"error": "Cancel your subscription before deleting your account."})
		return false
	}

	// Block while other members remain — deleting the owner would orphan them.
	others, err := database.GetUserCollection().CountDocuments(ctx,
		bson.M{"fleet_id": fleetID, "_id": bson.M{"$ne": ownerObjID}})
	if err != nil {
		log.Printf("DeleteUser: member count failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return false
	}
	if others > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Remove all drivers from your fleet before deleting your account."})
		return false
	}

	// Cascade every fleet-scoped collection. Done before the user delete so a
	// failure here leaves the account intact and the operation safely retriable.
	fleetFilter := bson.M{"fleet_id": fleetID}
	cascade := []*mongo.Collection{
		database.GetTruckCollection(),
		database.GetExpenseCollection(),
		database.GetLoadCollection(),
		database.GetInviteCollection(),
		database.GetMileageLogCollection(),
		database.GetIftaMilesCollection(),
		database.GetIftaFuelCollection(),
	}
	for _, col := range cascade {
		if _, err := col.DeleteMany(ctx, fleetFilter); err != nil {
			log.Printf("DeleteUser: cascade delete failed fleet=%s col=%s: %v", fleetID, col.Name(), err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
			return false
		}
	}
	if _, err := database.GetFleetCollection().DeleteOne(ctx, bson.M{"_id": fleet.ID}); err != nil {
		log.Printf("DeleteUser: fleet delete failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return false
	}
	return true
}
