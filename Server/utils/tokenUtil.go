package utils

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Token TTLs are constants so the lifetime policy lives in one place. Access
// tokens are short so a stolen Authorization header expires quickly; refresh
// tokens are longer to keep humans logged in across phone restarts.
const (
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 24 * time.Hour
)

// JWT claim keys. Hoisted to constants to keep keyfunc/issuance/parsing in
// lockstep — a typo in any one site silently invalidates every token.
const (
	claimUserID  = "userID"
	claimRole    = "role"
	claimFleetID = "fleetID"
	claimType    = "type"
	claimExp     = "exp"
)

// Token type discriminator values. The "type" claim guards against using a
// refresh token where an access token is expected (and vice-versa).
const (
	tokenTypeAccess  = "access"
	tokenTypeRefresh = "refresh"
)

func getSecret() string {
	return os.Getenv("JWT_SECRET")
}

// GenerateAccessToken creates a short-lived (15 min) JWT for API authorization.
//
// The role and fleetID claims are embedded so the auth middleware and the
// RequireOwner gate can authorize without a per-request user lookup. Both
// values are taken from the persisted user record — never from client input.
func GenerateAccessToken(userID, role, fleetID string) (string, error) {
	claims := jwt.MapClaims{
		claimUserID:  userID,
		claimRole:    role,
		claimFleetID: fleetID,
		claimType:    tokenTypeAccess,
		claimExp:     time.Now().Add(accessTokenTTL).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(getSecret()))
}

// GenerateRefreshToken creates a long-lived (24 hour) JWT for obtaining new
// access tokens. Role/fleetID are intentionally NOT embedded — they are
// re-read from the database when a refresh is exchanged for an access token,
// so a role change takes effect on the next refresh cycle.
func GenerateRefreshToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		claimUserID: userID,
		claimType:   tokenTypeRefresh,
		claimExp:    time.Now().Add(refreshTokenTTL).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(getSecret()))
}

// ValidateAccessToken validates an access token and returns the claims the
// auth middleware needs to populate the gin.Context: userID, role, fleetID.
//
// Errors are intentionally generic — the caller decides what to surface to
// the client. A missing role/fleetID claim on a token issued before this
// release is treated as invalid; users will be forced through a fresh login,
// which is the safe default after an auth-shape change.
func ValidateAccessToken(tokenString string) (userID, role, fleetID string, err error) {
	claims, err := validateTokenClaims(tokenString, tokenTypeAccess)
	if err != nil {
		return "", "", "", err
	}

	userID, ok := claims[claimUserID].(string)
	if !ok || userID == "" {
		return "", "", "", fmt.Errorf("invalid userID claim")
	}
	role, ok = claims[claimRole].(string)
	if !ok || role == "" {
		return "", "", "", fmt.Errorf("invalid role claim")
	}
	// fleetID may be empty for an owner whose fleet creation has not yet
	// completed (transient state during registration), so we accept the
	// claim being present-but-empty. We still require the key to be a string
	// to defend against a malformed token.
	fleetIDClaim, ok := claims[claimFleetID]
	if !ok {
		return "", "", "", fmt.Errorf("missing fleetID claim")
	}
	fleetID, ok = fleetIDClaim.(string)
	if !ok {
		return "", "", "", fmt.Errorf("invalid fleetID claim")
	}

	return userID, role, fleetID, nil
}

// ValidateRefreshToken validates a refresh token and returns the userID.
func ValidateRefreshToken(tokenString string) (string, error) {
	claims, err := validateTokenClaims(tokenString, tokenTypeRefresh)
	if err != nil {
		return "", err
	}
	userID, ok := claims[claimUserID].(string)
	if !ok || userID == "" {
		return "", fmt.Errorf("invalid userID claim")
	}
	return userID, nil
}

// validateTokenClaims parses and verifies a signed JWT, enforcing HS256 as the
// only acceptable algorithm and confirming the embedded "type" claim matches
// expectedType. It returns the full claims map so each public validator can
// extract the keys relevant to its token shape — this is the DRY core of both
// ValidateAccessToken and ValidateRefreshToken.
func validateTokenClaims(tokenString string, expectedType string) (jwt.MapClaims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		jwt.MapClaims{},
		func(token *jwt.Token) (interface{}, error) {
			// Defense in depth against alg-confusion attacks:
			//   1. Reject anything that is not HMAC. SigningMethodHMAC inherently
			//      excludes alg=none and asymmetric algorithms (RS*/ES*/PS*) where
			//      an attacker could try to coerce our HMAC secret to be treated
			//      as a public key.
			//   2. Within HMAC, pin to HS256 specifically so HS384/HS512 tokens
			//      are not silently accepted with the same secret.
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, fmt.Errorf("unexpected HMAC variant: %v", token.Header["alg"])
			}
			return []byte(getSecret()), nil
		},
		// Belt-and-suspenders: parser-level allowlist short-circuits unsupported
		// algorithms before the keyfunc is even invoked.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)

	if err != nil || !token.Valid {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	tokenType, ok := claims[claimType].(string)
	if !ok || tokenType != expectedType {
		return nil, fmt.Errorf("invalid token type: expected %s", expectedType)
	}

	return claims, nil
}
