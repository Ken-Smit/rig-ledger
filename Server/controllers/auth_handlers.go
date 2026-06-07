package controllers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/Ken-Smit/RigLedgerServer/services"
	"github.com/Ken-Smit/RigLedgerServer/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"
)

// One-time token lifetimes. Verification links last a day so a user can act on
// the email at their convenience; reset links are short so a leaked link has a
// narrow window. Tokens are single-use regardless — consuming one clears it.
const (
	verifyTokenTTL = 24 * time.Hour
	resetTokenTTL  = 1 * time.Hour
)

// appBaseURL returns the frontend origin used to build emailed links. It prefers
// APP_BASE_URL and falls back to ALLOWED_ORIGIN (the SPA origin already required
// for CORS) so a same-site deploy needs no extra config. Any trailing slash is
// trimmed so link building can always append "/path".
func appBaseURL() string {
	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = os.Getenv("ALLOWED_ORIGIN")
	}
	return strings.TrimRight(base, "/")
}

// userValidator validates user-facing request DTOs (UserProfileUpdate, etc.).
// Reused per validator/v10 best practice — instances cache reflection metadata
// and are safe for concurrent use.
//
// Lives in auth_handlers.go because both Register and Login depend on it for
// DTO validation; user_handlers.go (same package) references it directly from
// decodeProfileUpdate.
var userValidator = validator.New()

// bcryptCost is the work factor used for password hashing. CLAUDE.md mandates a
// minimum of 12; 14 is chosen for stronger resistance to offline cracking and
// must not be lowered without a documented reason.
const bcryptCost = 14

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

// DriverRegisterRequest is the local DTO for POST /auth/register-driver.
//
// Declared as a controller-local type (rather than in the models package) so
// the auth layer owns this surface end-to-end and the request shape is colocated
// with the only handler that consumes it. Validation tags mirror RegisterRequest
// (CLAUDE.md min=12 password policy) and add the invite token field.
//
// SECURITY: like RegisterRequest, this DTO deliberately omits role, fleet_id,
// _id, refresh_token, and timestamps — those are server-managed.
type DriverRegisterRequest struct {
	Token     string `json:"token"      validate:"required"`
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name"  validate:"required,min=2,max=100"`
	Email     string `json:"email"      validate:"required,email"`
	Password  string `json:"password"   validate:"required,min=12"`
}

// registrationFieldLabels maps RegisterRequest struct field names to the
// human-readable labels surfaced to the client. Keep keys in sync with
// models.RegisterRequest.
var registrationFieldLabels = map[string]string{
	"FirstName": "First name",
	"LastName":  "Last name",
	"Email":     "Email",
	"Password":  "Password",
	"Token":     "Invite token",
}

// registrationErrorMessage translates a validator error into plain-English copy
// a non-technical operator can act on. Falls back to a generic message if the
// error is not a ValidationErrors (e.g. raw JSON bind failure) so internal
// details are never leaked verbatim.
func registrationErrorMessage(err error) string {
	var vErrs validator.ValidationErrors
	if !errors.As(err, &vErrs) {
		return "Please check your registration details and try again"
	}
	msgs := make([]string, 0, len(vErrs))
	for _, fe := range vErrs {
		label, ok := registrationFieldLabels[fe.Field()]
		if !ok {
			label = fe.Field()
		}
		switch fe.Tag() {
		case "required":
			msgs = append(msgs, fmt.Sprintf("%s is required", label))
		case "email":
			msgs = append(msgs, "Please enter a valid email address")
		case "min":
			if fe.Field() == "Password" {
				msgs = append(msgs, fmt.Sprintf("Password must be at least %s characters", fe.Param()))
			} else {
				msgs = append(msgs, fmt.Sprintf("%s must be at least %s characters", label, fe.Param()))
			}
		case "max":
			msgs = append(msgs, fmt.Sprintf("%s must be no more than %s characters", label, fe.Param()))
		default:
			msgs = append(msgs, fmt.Sprintf("%s is invalid", label))
		}
	}
	return strings.Join(msgs, ". ")
}

// emailExists reports whether a user document with the given email already
// exists. Returns (true, nil) on hit, (false, nil) on miss, (false, err) on
// any other Mongo failure. Centralized so Register and RegisterDriver share
// one code path for the duplicate-email check.
func emailExists(ctx context.Context, col *mongo.Collection, email string) (bool, error) {
	var existing models.User
	err := col.FindOne(ctx, bson.M{"email": email}).Decode(&existing)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	return false, err
}

// Register creates a new owner account and provisions the owner's first fleet.
//
// SECURITY: binds RegisterRequest (NOT models.User) so a registrant cannot
// inject _id, user_id, refresh_token, role, fleet_id, created_at, or updated_at.
// Server-managed fields are populated explicitly below.
//
// Provisioning is a multi-step transactional sequence:
//  1. Insert the user document (no role / fleet_id yet).
//  2. Insert a Fleet doc with owner_id = new user._id.
//  3. Update the user with role=owner + fleet_id=<new fleet>.
//
// If step 2 or step 3 fails, step 1 is rolled back (user deleted). Every
// downstream controller assumes that role != "" implies fleet_id != ""; an
// owner without a fleet would break every protected route. We choose rollback
// over leave-and-retry because there is no idempotent way to resume a partial
// registration without exposing more state to the client.
func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Please check your registration details and try again")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, registrationErrorMessage(err))
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	exists, err := emailExists(ctx, userCollection, req.Email)
	if err != nil {
		log.Printf("Register: dup-check failed email=%s: %v", req.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing user"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	// Hash password. A bcrypt failure is a true 500 — we never want to persist
	// a user document with an empty password hash.
	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		log.Printf("Register: bcrypt failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	// Generate a one-time email-verification token. The raw value goes only into
	// the emailed link; the database holds the sha256 hash + expiry. A crypto/rand
	// failure is a true 500 — we never fall back to a weaker source.
	rawVerifyToken, verifyHash, err := utils.GenerateSecureToken()
	if err != nil {
		log.Printf("Register: verify token generation failed email=%s: %v", req.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	now := time.Now()
	verifyExp := now.Add(verifyTokenTTL)
	user := models.User{
		ID:              bson.NewObjectID(),
		FirstName:       req.FirstName,
		LastName:        req.LastName,
		Email:           req.Email,
		Password:        hashedPassword,
		EmailVerified:   false,
		VerifyTokenHash: verifyHash,
		VerifyTokenExp:  &verifyExp,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err := userCollection.InsertOne(ctx, user); err != nil {
		log.Printf("Register: insert failed email=%s: %v", req.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	if err := bootstrapOwnerFleet(ctx, userCollection, user); err != nil {
		// Best-effort rollback of the user insert. If the delete itself fails
		// we have an orphan user with no role/fleet — log loudly so ops can
		// reconcile manually. Every protected handler defends against an empty
		// fleet_id with a 401, so the orphan cannot be used to access data.
		if _, delErr := userCollection.DeleteOne(ctx, bson.M{"_id": user.ID}); delErr != nil {
			log.Printf("Register: rollback failed user=%s: %v (after fleet bootstrap err: %v)", user.ID.Hex(), delErr, err)
		} else {
			log.Printf("Register: rolled back user=%s after fleet bootstrap err: %v", user.ID.Hex(), err)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	// Send the verification email. A send failure is logged but does NOT fail
	// registration: the user + token are already persisted, so the account can
	// be activated later via Resend verification. The token itself is never
	// logged.
	verifyLink := fmt.Sprintf("%s/verify-email?token=%s", appBaseURL(), rawVerifyToken)
	if err := services.SendVerificationEmail(user.Email, verifyLink); err != nil {
		log.Printf("Register: verification email send failed user=%s: %v", user.ID.Hex(), err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Check your email to verify your account."})
}

// bootstrapOwnerFleet creates the first fleet for a freshly-inserted owner and
// updates the user's role/fleet_id. Returns a non-nil error if either step
// fails so the caller can perform compensating cleanup (delete the user doc).
//
// The owner's user._id.Hex() is the fleet's owner_id (string match for the
// ownership filter on every owner-only handler). Fleet name defaults to
// "<FirstName>'s Fleet" — owners can rename later via a future settings flow.
func bootstrapOwnerFleet(ctx context.Context, userCollection *mongo.Collection, user models.User) error {
	now := time.Now()
	fleet := models.Fleet{
		ID:        bson.NewObjectID(),
		OwnerID:   user.ID.Hex(),
		Name:      user.FirstName + "'s Fleet",
		CreatedAt: now,
	}

	fleetCol := database.GetFleetCollection()
	if _, err := fleetCol.InsertOne(ctx, fleet); err != nil {
		return fmt.Errorf("insert fleet: %w", err)
	}

	_, err := userCollection.UpdateOne(ctx,
		bson.M{"_id": user.ID},
		bson.M{"$set": bson.M{
			"role":       models.RoleOwner,
			"fleet_id":   fleet.ID.Hex(),
			"updated_at": now,
		}},
	)
	if err != nil {
		// We could attempt to delete the orphan fleet here, but the caller is
		// already going to roll back the user; an orphan fleet (no users
		// pointing to it) is harmless and discoverable via owner_id audit.
		return fmt.Errorf("set role/fleet: %w", err)
	}
	return nil
}

// Login authenticates a user and issues access + refresh tokens via httpOnly
// cookies. Refresh-token persistence failures are logged but do not fail the
// login — see persistRefreshToken for the rationale.
//
// SECURITY: a user with an empty Role is treated as an internal data-integrity
// failure (Register always sets role on a fresh account, and the migration in
// Track 1 backfills legacy rows). We refuse to mint a token without a known
// role rather than fall back to a privileged default.
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

	// 3. Hard email-verification gate. A registrant must prove ownership of the
	// email before any session is issued. The stable "code" lets the SPA show a
	// "resend verification" affordance instead of a generic error. Legacy users
	// are backfilled to verified at startup, so this never blocks an existing
	// account.
	if !foundUser.EmailVerified {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Please verify your email before signing in.",
			"code":  "email_unverified",
		})
		return
	}

	// 4. Defense-in-depth: refuse to issue a token for a user with no role.
	// This should never happen post-migration; if it does, the access token
	// would have role="" and every owner-only middleware check would fail
	// silently with a confusing 403. Fail loud, fail server-side.
	if foundUser.Role == "" {
		log.Printf("Login: user has empty role user=%s — migration miss?", foundUser.ID.Hex())
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Account is not fully provisioned"})
		return
	}

	// 4. Generate access token (15 min) and refresh token (24 hours).
	accessToken, err := utils.GenerateAccessToken(foundUser.ID.Hex(), foundUser.Role, foundUser.FleetID)
	if err != nil {
		log.Printf("Login: access token generation failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	refreshToken, err := utils.GenerateRefreshToken(foundUser.ID.Hex())
	if err != nil {
		log.Printf("Login: refresh token generation failed user=%s: %v", foundUser.ID.Hex(), err)
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

// RegisterDriver creates a driver account from a single-use invite token.
//
// SECURITY:
//   - The raw token is hashed (sha256-hex) before any DB lookup; the invite
//     collection only stores the hash, so a leaked DB dump cannot be replayed.
//   - "not found", "expired", and "already consumed" all collapse into a single
//     400 with identical copy — no enumeration oracle for valid invite tokens.
//   - The invite's fleet_id is the only source of truth for the driver's fleet
//     binding. The body deliberately does NOT carry fleet_id / role.
//   - Email collision against existing users is checked the same way as
//     Register so two accounts cannot share an email.
//   - On any post-insert failure, the user document is rolled back to avoid
//     leaving a passwordless / unconsumed-invite-pinned ghost.
func RegisterDriver(c *gin.Context) {
	var req DriverRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Please check your registration details and try again")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, registrationErrorMessage(err))
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	// 1. Look up the invite by token hash.
	inviteCol := database.GetInviteCollection()
	var invite models.Invite
	err := inviteCol.FindOne(ctx, bson.M{"token_hash": utils.HashToken(req.Token)}).Decode(&invite)
	if err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("RegisterDriver: invite lookup failed: %v", err)
		}
		// Generic copy for missing/expired/consumed — see SECURITY note.
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invite is invalid or has expired"})
		return
	}
	if invite.ConsumedAt != nil || time.Now().After(invite.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invite is invalid or has expired"})
		return
	}

	// 2. Email collision check (same as owner Register).
	userCollection := database.GetUserCollection()
	exists, err := emailExists(ctx, userCollection, req.Email)
	if err != nil {
		log.Printf("RegisterDriver: dup-check failed email=%s: %v", req.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing user"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	// 3. Hash password.
	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		log.Printf("RegisterDriver: bcrypt failed: %v", err)
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
		Role:      models.RoleDriver,
		FleetID:   invite.FleetID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := userCollection.InsertOne(ctx, user); err != nil {
		log.Printf("RegisterDriver: insert failed email=%s: %v", req.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	// 4. Mark invite consumed. If this fails, the user is rolled back: an
	// unconsumed invite is fine, but a consumed-twice invite would let two
	// drivers join from one token. Choose rollback over double-spend.
	consumedAt := now
	upd, err := inviteCol.UpdateOne(ctx,
		bson.M{"_id": invite.ID, "consumed_at": nil},
		bson.M{"$set": bson.M{"consumed_at": consumedAt}},
	)
	if err != nil || upd.ModifiedCount == 0 {
		if _, delErr := userCollection.DeleteOne(ctx, bson.M{"_id": user.ID}); delErr != nil {
			log.Printf("RegisterDriver: rollback failed user=%s: %v (after invite consume err: %v)", user.ID.Hex(), delErr, err)
		} else {
			log.Printf("RegisterDriver: rolled back user=%s after invite consume failure: %v", user.ID.Hex(), err)
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invite is invalid or has expired"})
		return
	}

	// 5. Issue tokens. Token-generation failure post-insert is also a rollback
	// trigger — we do not want a half-onboarded driver who cannot log in.
	accessToken, err := utils.GenerateAccessToken(user.ID.Hex(), user.Role, user.FleetID)
	if err != nil {
		log.Printf("RegisterDriver: access token generation failed user=%s: %v", user.ID.Hex(), err)
		if _, delErr := userCollection.DeleteOne(ctx, bson.M{"_id": user.ID}); delErr != nil {
			log.Printf("RegisterDriver: rollback failed user=%s: %v", user.ID.Hex(), delErr)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}
	refreshToken, err := utils.GenerateRefreshToken(user.ID.Hex())
	if err != nil {
		log.Printf("RegisterDriver: refresh token generation failed user=%s: %v", user.ID.Hex(), err)
		if _, delErr := userCollection.DeleteOne(ctx, bson.M{"_id": user.ID}); delErr != nil {
			log.Printf("RegisterDriver: rollback failed user=%s: %v", user.ID.Hex(), delErr)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	persistRefreshToken(ctx, userCollection, user.ID, refreshToken)
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

// RefreshAccessToken validates the refresh-token cookie, rotates the refresh
// token in the database, and re-issues both tokens as new httpOnly cookies.
// Refresh-token persistence failures during rotation are logged but do not
// fail the request — see persistRefreshToken.
//
// The new access token carries the user's CURRENT role/fleet — important if
// an owner re-provisions or migrates fleets between accesses.
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

	if user.Role == "" {
		log.Printf("RefreshAccessToken: user has empty role user=%s — migration miss?", userID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Account is not fully provisioned"})
		return
	}

	// Generate new access token with the user's current role/fleet.
	newAccessToken, err := utils.GenerateAccessToken(userID, user.Role, user.FleetID)
	if err != nil {
		log.Printf("RefreshAccessToken: access token generation failed user=%s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	// Rotate refresh token.
	newRefreshToken, err := utils.GenerateRefreshToken(userID)
	if err != nil {
		log.Printf("RefreshAccessToken: refresh token generation failed user=%s: %v", userID, err)
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

// VerifyEmail consumes a one-time verification token and marks the account
// verified, unlocking login.
//
// SECURITY: the raw token is hashed before lookup; the query also requires a
// non-expired token. "not found" and "expired" collapse into one generic
// message so the endpoint is not an oracle for valid tokens. The token fields
// are cleared on success so a link cannot be replayed.
func VerifyEmail(c *gin.Context) {
	var req models.VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "This verification link is invalid or has expired.")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, "This verification link is invalid or has expired.")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	filter := bson.M{
		"verify_token_hash": utils.HashToken(req.Token),
		"verify_token_exp":  bson.M{"$gt": time.Now()},
	}
	update := bson.M{
		"$set":   bson.M{"email_verified": true, "updated_at": time.Now()},
		"$unset": bson.M{"verify_token_hash": "", "verify_token_exp": ""},
	}

	res, err := userCollection.UpdateOne(ctx, filter, update)
	if err != nil {
		log.Printf("VerifyEmail: update failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This verification link is invalid or has expired."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Your email has been verified. You can now sign in."})
}

// ResendVerification re-issues a verification link for an unverified account.
//
// SECURITY: this endpoint ALWAYS returns the same generic success, whether or
// not the email maps to an account (and whether or not it is already verified),
// so it cannot be used to enumerate registered emails. Work happens only when a
// genuinely-unverified user exists.
func ResendVerification(c *gin.Context) {
	var req models.ResendVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Please enter a valid email address")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, "Please enter a valid email address")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	const genericMsg = "If that account exists and is unverified, we've sent a new verification link."

	var foundUser models.User
	err := userCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&foundUser)
	if err != nil || foundUser.EmailVerified {
		// No account, or already verified — say nothing either way.
		if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("ResendVerification: lookup failed: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}

	rawToken, hash, err := utils.GenerateSecureToken()
	if err != nil {
		log.Printf("ResendVerification: token generation failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}
	exp := time.Now().Add(verifyTokenTTL)
	_, err = userCollection.UpdateOne(ctx,
		bson.M{"_id": foundUser.ID},
		bson.M{"$set": bson.M{"verify_token_hash": hash, "verify_token_exp": exp, "updated_at": time.Now()}},
	)
	if err != nil {
		log.Printf("ResendVerification: token persist failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}

	link := fmt.Sprintf("%s/verify-email?token=%s", appBaseURL(), rawToken)
	if err := services.SendVerificationEmail(foundUser.Email, link); err != nil {
		log.Printf("ResendVerification: email send failed user=%s: %v", foundUser.ID.Hex(), err)
	}

	c.JSON(http.StatusOK, gin.H{"message": genericMsg})
}

// ForgotPassword issues a one-time password-reset link.
//
// SECURITY: ALWAYS returns the same generic success regardless of whether the
// email exists — no enumeration oracle. The reset token is stored hashed with a
// short TTL; the raw token only lives in the emailed link.
func ForgotPassword(c *gin.Context) {
	var req models.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "Please enter a valid email address")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		badRequest(c, err, "Please enter a valid email address")
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	const genericMsg = "If an account exists for that email, we've sent a password reset link."

	var foundUser models.User
	err := userCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&foundUser)
	if err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("ForgotPassword: lookup failed: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}

	rawToken, hash, err := utils.GenerateSecureToken()
	if err != nil {
		log.Printf("ForgotPassword: token generation failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}
	exp := time.Now().Add(resetTokenTTL)
	_, err = userCollection.UpdateOne(ctx,
		bson.M{"_id": foundUser.ID},
		bson.M{"$set": bson.M{"reset_token_hash": hash, "reset_token_exp": exp, "updated_at": time.Now()}},
	)
	if err != nil {
		log.Printf("ForgotPassword: token persist failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusOK, gin.H{"message": genericMsg})
		return
	}

	link := fmt.Sprintf("%s/reset-password?token=%s", appBaseURL(), rawToken)
	if err := services.SendPasswordResetEmail(foundUser.Email, link); err != nil {
		log.Printf("ForgotPassword: email send failed user=%s: %v", foundUser.ID.Hex(), err)
	}

	c.JSON(http.StatusOK, gin.H{"message": genericMsg})
}

// ResetPassword consumes a one-time reset token and sets a new password.
//
// SECURITY:
//   - The raw token is hashed before lookup and must be unexpired.
//   - The new password is re-validated against the min=12 policy and hashed at
//     bcrypt cost 14 (same as registration).
//   - On success the reset token is cleared (single use) AND the stored refresh
//     token is wiped so every existing session is invalidated — a password reset
//     should log out all other devices. The caller's own cookies are cleared too.
//   - "not found" / "expired" collapse into one generic message.
func ResetPassword(c *gin.Context) {
	var req models.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err, "This reset link is invalid or has expired.")
		return
	}
	if err := userValidator.Struct(req); err != nil {
		// A short password is the most likely validation failure here; surface
		// the actionable policy message rather than a generic one.
		badRequest(c, err, registrationErrorMessage(err))
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()
	userCollection := database.GetUserCollection()

	var foundUser models.User
	filter := bson.M{
		"reset_token_hash": utils.HashToken(req.Token),
		"reset_token_exp":  bson.M{"$gt": time.Now()},
	}
	if err := userCollection.FindOne(ctx, filter).Decode(&foundUser); err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			log.Printf("ResetPassword: lookup failed: %v", err)
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "This reset link is invalid or has expired."})
		return
	}

	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		log.Printf("ResetPassword: bcrypt failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	update := bson.M{
		"$set":   bson.M{"password": hashedPassword, "refresh_token": "", "updated_at": time.Now()},
		"$unset": bson.M{"reset_token_hash": "", "reset_token_exp": ""},
	}
	if _, err := userCollection.UpdateOne(ctx, bson.M{"_id": foundUser.ID}, update); err != nil {
		log.Printf("ResetPassword: update failed user=%s: %v", foundUser.ID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	// Clear any cookies the caller might still hold so the reset device is also
	// logged out and must sign in with the new password.
	utils.ClearAuthCookies(c)

	c.JSON(http.StatusOK, gin.H{"message": "Your password has been reset. You can now sign in."})
}
