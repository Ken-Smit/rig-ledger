package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Role constants — the ONLY two roles in Rig Ledger.
//
// SECURITY: These are the canonical strings used by the JWT "role" claim, the
// User.Role bson field, and the RequireOwner middleware. Adding a new role is a
// security decision that must be coordinated across token issuance, the role
// middleware allowlist, and the migration backfill — do not introduce one
// casually.
const (
	RoleOwner  = "owner"
	RoleDriver = "driver"
)

// User is the persisted shape of a Rig Ledger account.
//
// SECURITY: Password and RefreshToken are tagged json:"-" so they can never
// leave the server in a JSON response, even if a future handler accidentally
// passes a *User to c.JSON. Inbound JSON for registration must use
// RegisterRequest, which is the only DTO permitted to accept a plaintext
// password from the wire.
//
// Role / FleetID: every authenticated user has a Role ("owner" | "driver") and
// a FleetID (hex ObjectID of their Fleet). The Role drives authorization
// (owners manage trucks/expenses/invites; drivers see only their assigned
// fleet's read surface and log mileage). FleetID scopes every query — a user
// can never read or mutate a document outside their own fleet.
type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserID       string        `bson:"user_id" json:"user_id"`
	FirstName    string        `bson:"first_name" json:"first_name" validate:"required,min=2,max=100"`
	LastName     string        `bson:"last_name" json:"last_name" validate:"required,min=2,max=100"`
	Email        string        `bson:"email" json:"email" validate:"required,email"`
	Password     string        `bson:"password" json:"-" validate:"required,min=12"`
	Role         string        `bson:"role" json:"role" validate:"required,oneof=owner driver"`
	FleetID      string        `bson:"fleet_id,omitempty" json:"fleet_id,omitempty"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at" json:"updated_at"`
	RefreshToken string        `bson:"refresh_token" json:"-"`

	// EmailVerified gates login: a freshly-registered owner cannot sign in until
	// they click the verification link. Legacy users are backfilled to true at
	// startup so the gate never locks out an existing account.
	EmailVerified bool `bson:"email_verified" json:"-"`

	// One-time email-verification token. Only the sha256 hash and its expiry are
	// stored — the raw token lives only in the emailed link. Cleared on consume.
	VerifyTokenHash string     `bson:"verify_token_hash,omitempty" json:"-"`
	VerifyTokenExp  *time.Time `bson:"verify_token_exp,omitempty" json:"-"`

	// One-time password-reset token. Same hash-at-rest discipline as the verify
	// token; shorter TTL. Cleared on consume, and consuming it also wipes the
	// refresh token to terminate every existing session.
	ResetTokenHash string     `bson:"reset_token_hash,omitempty" json:"-"`
	ResetTokenExp  *time.Time `bson:"reset_token_exp,omitempty" json:"-"`
}

// RegisterRequest is the request DTO for POST /register.
//
// SECURITY: This is the ONLY struct permitted to accept a plaintext password
// from the wire. It deliberately omits _id, user_id, refresh_token, created_at,
// and updated_at — those are server-managed and must never be settable by a
// registrant (mass-assignment defense). Adding a new field here exposes it to
// untrusted client input; weigh that carefully.
type RegisterRequest struct {
	FirstName string `json:"first_name" validate:"required,min=2,max=100"`
	LastName  string `json:"last_name"  validate:"required,min=2,max=100"`
	Email     string `json:"email"      validate:"required,email"`
	Password  string `json:"password"   validate:"required,min=12"`
}

// UserLogin is the request DTO for POST /login.
//
// Validation tags are required so that empty or malformed submissions are
// rejected at the validator boundary, before any database lookup runs.
type UserLogin struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// UserResponse is the projection returned to authenticated clients reading
// their own profile. It intentionally omits the bcrypt hash, refresh token,
// timestamps, and the internal Mongo _id.
//
// Role and FleetID are surfaced so the SPA can branch its navigation/UI by
// role and pin requests to the correct fleet without a second round-trip.
type UserResponse struct {
	UserID    string `json:"user_id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	FleetID   string `json:"fleet_id"`
}

// UserProfileUpdate is the request DTO for PATCH /user/profile.
//
// Only the fields a user is permitted to self-edit may appear here. Email,
// password, refresh_token, user_id, _id, and timestamps are intentionally
// excluded — they require dedicated, verified flows (or are server-managed).
//
// Pointers are used so the handler can distinguish "field omitted" from
// "field set to empty string" and avoid clobbering values the caller did
// not intend to touch.
//
// SECURITY: Adding a new field here directly exposes it to client mutation.
// Do not add email, password, or any auth-relevant field without a
// corresponding verification flow.
type UserProfileUpdate struct {
	FirstName *string `json:"first_name" validate:"omitempty,min=2,max=100"`
	LastName  *string `json:"last_name"  validate:"omitempty,min=2,max=100"`
}

// VerifyEmailRequest is the request DTO for POST /auth/verify-email. The token
// is the raw value from the emailed link; the server hashes it before lookup.
type VerifyEmailRequest struct {
	Token string `json:"token" validate:"required"`
}

// ResendVerifyRequest is the request DTO for POST /auth/resend-verification.
// Only an email is needed — the handler returns a generic success regardless of
// whether the account exists, so this surface is not an enumeration oracle.
type ResendVerifyRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// ForgotPasswordRequest is the request DTO for POST /auth/forgot-password.
// Like ResendVerifyRequest, the handler always returns generic success.
type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// ResetPasswordRequest is the request DTO for POST /auth/reset-password.
//
// SECURITY: this is — alongside RegisterRequest and DriverRegisterRequest — one
// of the few DTOs permitted to accept a plaintext password. It enforces the
// same min=12 policy. The token is the raw reset token from the emailed link.
type ResetPasswordRequest struct {
	Token    string `json:"token"    validate:"required"`
	Password string `json:"password" validate:"required,min=12"`
}
