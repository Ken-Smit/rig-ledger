package utils

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func getSecret() string {
	return os.Getenv("JWT_SECRET")
}

// GenerateAccessToken creates a short-lived (15 min) JWT for API authorization
func GenerateAccessToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"userID": userID,
		"type":   "access",
		"exp":    time.Now().Add(15 * time.Minute).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(getSecret()))
}

// GenerateRefreshToken creates a long-lived (24 hour) JWT for obtaining new access tokens
func GenerateRefreshToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"userID": userID,
		"type":   "refresh",
		"exp":    time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(getSecret()))
}

// ValidateAccessToken validates an access token and returns the userID
func ValidateAccessToken(tokenString string) (string, error) {
	return validateToken(tokenString, "access")
}

// ValidateRefreshToken validates a refresh token and returns the userID
func ValidateRefreshToken(tokenString string) (string, error) {
	return validateToken(tokenString, "refresh")
}

// validateToken parses and verifies a signed JWT, enforcing HS256 as the only
// acceptable algorithm and confirming the embedded "type" claim matches expectedType.
// It returns the userID claim on success.
func validateToken(tokenString string, expectedType string) (string, error) {
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
		return "", err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid token claims")
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != expectedType {
		return "", fmt.Errorf("invalid token type: expected %s", expectedType)
	}

	userID, ok := claims["userID"].(string)
	if !ok {
		return "", fmt.Errorf("invalid userID claim")
	}

	return userID, nil
}
