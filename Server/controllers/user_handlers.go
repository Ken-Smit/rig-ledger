package controllers

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
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
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

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
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

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
// References userValidator declared in auth_handlers.go (same package).
func decodeProfileUpdate(c *gin.Context) (models.UserProfileUpdate, bool) {
	var update models.UserProfileUpdate

	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&update); err != nil {
		// Includes "json: unknown field" for rejected payloads.
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return update, false
	}
	// Reject trailing garbage / multiple JSON documents in the body.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return update, false
	}

	if err := userValidator.Struct(update); err != nil {
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

// DeleteUser removes the authenticated user's account.
func DeleteUser(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	objID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	_, err = userCollection.DeleteOne(ctx, bson.M{"_id": objID})
	if err != nil {
		log.Printf("DeleteUser: delete failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}
