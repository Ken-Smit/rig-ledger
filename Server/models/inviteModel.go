package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// InviteTTL is the wall-clock lifetime of an invite token.
//
// Mongo enforces this server-side via a TTL index on Invite.ExpiresAt
// (expireAfterSeconds=0). A 7-day window is the longest a fleet owner should
// have to wait for a driver to accept; shorter windows force re-issuance
// churn, longer windows widen the attack surface for stolen invite links.
const InviteTTL = 7 * 24 * time.Hour

// Invite is a single-use, time-bounded credential that lets a driver join an
// existing fleet without the owner sharing a password.
//
// SECURITY — token storage:
//   - The plaintext token is a 256-bit cryptographically random value, shown
//     to the recipient exactly once (in the invite URL).
//   - We persist ONLY the SHA-256 hex digest in TokenHash. Lookup is therefore
//     a single indexed equality probe on a hashed value — fast and constant-
//     time on the database side.
//   - bcrypt is deliberately NOT used here. bcrypt is for low-entropy human
//     passwords where slowness is the defense; an attacker who exfiltrates
//     the invites collection cannot brute-force a 256-bit random token under
//     SHA-256, and bcrypt's cost would force a per-row scan on every lookup
//     since each bcrypt hash uses a unique salt (no equality index possible).
//   - TokenHash is tagged json:"-" so it cannot leak through a marshal slip.
//
// Single-use: ConsumedAt is set on acceptance. Subsequent acceptance attempts
// must be rejected by the controller.
type Invite struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	FleetID    string        `bson:"fleet_id" json:"fleet_id"`
	CreatedBy  string        `bson:"created_by" json:"created_by"`
	Email      string        `bson:"email,omitempty" json:"email,omitempty"`
	TokenHash  string        `bson:"token_hash" json:"-"` // hex(sha256(rawToken))
	ExpiresAt  time.Time     `bson:"expires_at" json:"expires_at"`
	ConsumedAt *time.Time    `bson:"consumed_at,omitempty" json:"consumed_at,omitempty"`
	CreatedAt  time.Time     `bson:"created_at" json:"created_at"`
}

// InviteCreateRequest is the request DTO for POST /invites.
//
// Email is optional — owners may issue an open invite link or pre-bind an
// invite to a specific email for delivery via the SMTP pipeline.
type InviteCreateRequest struct {
	Email string `json:"email" validate:"omitempty,email"`
}
