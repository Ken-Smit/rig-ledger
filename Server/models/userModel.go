package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// User is the persisted shape of a Rig Ledger account.
//
// SECURITY: Password and RefreshToken are tagged json:"-" so they can never
// leave the server in a JSON response, even if a future handler accidentally
// passes a *User to c.JSON. Inbound JSON for registration must use
// RegisterRequest, which is the only DTO permitted to accept a plaintext
// password from the wire.
type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserID       string        `bson:"user_id" json:"user_id"`
	FirstName    string        `bson:"first_name" json:"first_name" validate:"required,min=2,max=100"`
	LastName     string        `bson:"last_name" json:"last_name" validate:"required,min=2,max=100"`
	Email        string        `bson:"email" json:"email" validate:"required,email"`
	Password     string        `bson:"password" json:"-" validate:"required,min=12"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at" json:"updated_at"`
	RefreshToken string        `bson:"refresh_token" json:"-"`
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
type UserResponse struct {
	UserID    string `json:"user_id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
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
