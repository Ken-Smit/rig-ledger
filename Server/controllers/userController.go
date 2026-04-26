package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// userValidator validates user-facing request DTOs (UserProfileUpdate, etc.).
// Reused per validator/v10 best practice — instances cache reflection metadata
// and are safe for concurrent use.
var userValidator = validator.New()

// bcryptCost is the work factor used for password hashing. CLAUDE.md mandates a
// minimum of 12; 14 is chosen for stronger resistance to offline cracking and
// must not be lowered without a documented reason.
const bcryptCost = 14

// userProfileProjection is a narrow read shape for GetUserProfile.
// We project to these four fields server-side so the bcrypt hash and refresh
// token never traverse the wire from MongoDB into application memory.
type userProfileProjection struct {
	UserID    string `bson:"user_id"`
	FirstName string `bson:"first_name"`
	LastName  string `bson:"last_name"`
	Email     string `bson:"email"`
}

// HashPassword returns a bcrypt hash of the supplied plaintext password.
// It returns an error if the underlying bcrypt call fails so callers can
// respond appropriately rather than persisting an empty hash.
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// VerifyPassword reports whether plaintextPassword matches hashedPassword.
// Argument order matches bcrypt.CompareHashAndPassword (hash first, plaintext
// second) — do not swap, even if a future call site passes them backwards.
func VerifyPassword(hashedPassword, plaintextPassword string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plaintextPassword)) == nil
}

// Register creates a new user from a strictly-scoped RegisterRequest DTO.
//
// SECURITY: binds RegisterRequest (NOT models.User) so a registrant cannot
// inject _id, user_id, refresh_token, created_at, or updated_at. Server-managed
// fields are populated explicitly below.
func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Invalid registration payload")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, "Invalid registration payload")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	// Check for duplicate email.
	var existing models.User
	err := userCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&existing)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}
	if err != mongo.ErrNoDocuments {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing user"})
		return
	}

	// Hash password. A bcrypt failure is a true 500 — we never want to persist
	// a user document with an empty password hash.
	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	now := time.Now()
	user := models.User{
		ID:        bson.NewObjectID(),
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Email:     req.Email,
		Password:  hashedPassword,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := userCollection.InsertOne(ctx, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Registration successful"})
}

// Login authenticates a user and issues access + refresh tokens via httpOnly
// cookies. Refresh-token persistence failures are logged but do not fail the
// login — see persistRefreshToken for the rationale.
func Login(c *gin.Context) {
	var loginDetails models.UserLogin
	if err := c.ShouldBindJSON(&loginDetails); err != nil {
		badRequest(c, err, "Invalid login payload")
		return
	}
	if err := userValidator.Struct(loginDetails); err != nil {
		badRequest(c, err, "Invalid login payload")
		return
	}

	// 1. Fetch user from DB by email.
	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	var foundUser models.User
	err := userCollection.FindOne(ctx, bson.M{"email": loginDetails.Email}).Decode(&foundUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// 2. Verify password — pass the stored bcrypt hash first, plaintext from the
	// request second, matching bcrypt.CompareHashAndPassword's contract.
	if !VerifyPassword(foundUser.Password, loginDetails.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// 3. Generate access token (15 min) and refresh token (24 hours).
	accessToken, err := utils.GenerateAccessToken(foundUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	refreshToken, err := utils.GenerateRefreshToken(foundUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	// Persist refresh token — failures are logged, not fatal. See helper.
	persistRefreshToken(ctx, userCollection, foundUser.ID, refreshToken)

	// Set httpOnly cookies — these are the ONLY transport for tokens.
	// Tokens are intentionally NOT returned in the JSON body to keep them
	// unreachable from any JavaScript context (XSS hardening).
	utils.SetAccessTokenCookie(c, accessToken)
	utils.SetRefreshTokenCookie(c, refreshToken)

	c.JSON(http.StatusOK, gin.H{"logged_in": true})
}

// persistRefreshToken stores newToken on the user document at id.
//
// SECURITY / UX TRADE-OFF: a failed write is logged but NOT propagated to the
// caller. The access token already issued is valid for ~15 minutes, so the
// user can use the application immediately; if the next refresh attempt fails
// because of the missed write, the user will simply be forced to re-login.
// Failing the entire login on a transient Mongo hiccup would be a worse user
// experience than a logged warning. The log line is the operational breadcrumb
// that surfaces recurring write failures.
func persistRefreshToken(ctx context.Context, col *mongo.Collection, id bson.ObjectID, newToken string) {
	_, err := col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set": bson.M{"refresh_token": newToken},
	})
	if err != nil {
		log.Printf("warn: failed to persist refresh token for user %s: %v", id.Hex(), err)
	}
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
		"user_id":    1,
		"first_name": 1,
		"last_name":  1,
		"email":      1,
	})

	var profile userProfileProjection
	err = userCollection.FindOne(ctx, bson.M{"_id": objID}, opts).Decode(&profile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, models.UserResponse{
		UserID:    profile.UserID,
		FirstName: profile.FirstName,
		LastName:  profile.LastName,
		Email:     profile.Email,
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

// RefreshAccessToken validates the refresh-token cookie, rotates the refresh
// token in the database, and re-issues both tokens as new httpOnly cookies.
// Refresh-token persistence failures during rotation are logged but do not
// fail the request — see persistRefreshToken.
func RefreshAccessToken(c *gin.Context) {
	// Refresh token is read EXCLUSIVELY from the httpOnly cookie.
	// We deliberately do not accept it from the JSON body so that browser
	// JS cannot supply a token it scraped from somewhere else, and so that
	// no client-side code is tempted to persist the refresh token.
	refreshTokenStr, _ := c.Cookie("refresh_token")
	if refreshTokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No refresh token provided"})
		return
	}

	// Validate the refresh token.
	userID, err := utils.ValidateRefreshToken(refreshTokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}

	// Verify the refresh token matches what's stored in DB.
	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	objID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var user models.User
	err = userCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if user.RefreshToken != refreshTokenStr {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token has been revoked"})
		return
	}

	// Generate new access token.
	newAccessToken, err := utils.GenerateAccessToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	// Rotate refresh token.
	newRefreshToken, err := utils.GenerateRefreshToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	// Persist rotated refresh token — failures are logged, not fatal.
	persistRefreshToken(ctx, userCollection, objID, newRefreshToken)

	// Rotate cookies. Tokens are NOT returned in the JSON body — see Login.
	utils.SetAccessTokenCookie(c, newAccessToken)
	utils.SetRefreshTokenCookie(c, newRefreshToken)

	c.JSON(http.StatusOK, gin.H{"logged_in": true})
}

// Logout clears the persisted refresh token and the auth cookies.
// Mongo write failures are logged — the user is logging out anyway, and
// the cookies are still cleared, so the client side of the session is
// terminated regardless.
func Logout(c *gin.Context) {
	userID := c.GetString("userID")
	if userID != "" {
		ctx, cancel := dbCtx(c)
		defer cancel()
		userCollection := database.GetUserCollection()
		objID, err := bson.ObjectIDFromHex(userID)
		if err == nil {
			_, updErr := userCollection.UpdateOne(ctx, bson.M{"_id": objID}, bson.M{
				"$set": bson.M{"refresh_token": ""},
			})
			if updErr != nil {
				log.Printf("warn: failed to clear refresh token for user %s: %v", userID, updErr)
			}
		}
	}

	utils.ClearAuthCookies(c)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}
