// Package services holds the business-logic layer that sits between the HTTP
// handlers and external systems. The email service wraps Resend's HTTP API for
// transactional mail (email verification, password reset).
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// resendEndpoint is Resend's transactional send API. We POST JSON to it with a
// Bearer API key — no SDK is used so the server takes on no new dependency.
const resendEndpoint = "https://api.resend.com/emails"

// emailHTTPTimeout bounds how long a send may block. A slow mail provider must
// never hang a request-scoped goroutine indefinitely.
const emailHTTPTimeout = 10 * time.Second

// resendPayload is the minimal Resend request body we use.
type resendPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// apiKey / fromAddress are read once at process start. Keeping them package-level
// means a missing key is detected at boot (see main.go), not on first send.
var (
	apiKey      = os.Getenv("RESEND_API_KEY")
	fromAddress = os.Getenv("EMAIL_FROM")

	// devMode is true outside release builds. It gates a convenience log that
	// prints one-time links to the server console so flows can be exercised
	// locally without a real mailbox. This is the ONE place a raw token is
	// allowed to surface, and only when GIN_MODE != "release" — never in prod.
	devMode = os.Getenv("GIN_MODE") != "release"
)

// logDevLink prints a one-time link to the console in dev only. Never call this
// in release mode — it would leak a live token to the logs.
func logDevLink(kind, link string) {
	if devMode {
		log.Printf("[dev] %s link (do not enable in release): %s", kind, link)
	}
}

// SendVerificationEmail emails a one-time account-verification link.
func SendVerificationEmail(toEmail, link string) error {
	subject := "Verify Your Rig Ledger Account"
	html := fmt.Sprintf(
		`<p>Welcome to Rig Ledger.</p>`+
			`<p>Please confirm your email address to activate your account. `+
			`This link expires in 24 hours.</p>`+
			`<p><a href="%s">Verify my email</a></p>`+
			`<p>If you did not create an account, you can ignore this message.</p>`,
		link,
	)
	logDevLink("verify-email", link)
	return send(toEmail, subject, html)
}

// SendPasswordResetEmail emails a one-time password-reset link.
func SendPasswordResetEmail(toEmail, link string) error {
	subject := "Reset Your Rig Ledger Password"
	html := fmt.Sprintf(
		`<p>We received a request to reset your Rig Ledger password.</p>`+
			`<p>This link expires in 1 hour and can be used once.</p>`+
			`<p><a href="%s">Reset my password</a></p>`+
			`<p>If you did not request this, you can safely ignore this message — `+
			`your password will not change.</p>`,
		link,
	)
	logDevLink("reset-password", link)
	return send(toEmail, subject, html)
}

// send posts a single email to Resend.
//
// SECURITY: the recipient and subject are logged on failure for operability,
// but the HTML body (which carries the one-time token in its link) is never
// logged. In local dev with no RESEND_API_KEY configured, the send is skipped
// with a log line so auth flows still work end-to-end against the database.
func send(to, subject, html string) error {
	if apiKey == "" {
		log.Printf("email skipped (no RESEND_API_KEY): would send %q to %s", subject, to)
		return nil
	}

	body, err := json.Marshal(resendPayload{
		From:    fromAddress,
		To:      []string{to},
		Subject: subject,
		HTML:    html,
	})
	if err != nil {
		return fmt.Errorf("marshal email payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), emailHTTPTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("email provider returned status %d", resp.StatusCode)
	}
	return nil
}
