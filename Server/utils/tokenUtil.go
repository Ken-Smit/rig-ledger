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

func validateToken(tokenString string, expectedType string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenString, jwt.MapClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(getSecret()), nil
	})

	if err != nil || !token.Valid {
		return "", err
	}

	claims := token.Claims.(jwt.MapClaims)

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
