package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/controllers"
	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/middleware"
	"github.com/Ken-Smit/RigLedgerServer/routes"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const (
	defaultPort           = "8080"
	defaultDevAllowOrigin = "http://localhost:5173" // Vite dev server default
	envAllowedOrigin      = "ALLOWED_ORIGIN"
	envJWTSecret          = "JWT_SECRET"
	envMongoURI           = "MONGODB_URI"
	envPort               = "PORT"
	envResendAPIKey       = "RESEND_API_KEY"
	envEmailFrom          = "EMAIL_FROM"
	envStripeSecret        = "STRIPE_SECRET_KEY"
	envStripeWebhookSecret = "STRIPE_WEBHOOK_SECRET"
	envGinMode            = "GIN_MODE"
	ginReleaseMode        = "release"

	// minJWTSecretLen is the minimum acceptable JWT_SECRET length. HS256 is an
	// HMAC over a 256-bit key; a shorter secret weakens the signature and
	// invites brute force. 32 bytes = 256 bits.
	minJWTSecretLen = 32

	// maxMultipartMemory caps the in-memory buffer Gin uses when parsing
	// multipart uploads. Set to the receipt ceiling (10 MB, mirrors
	// controllers.maxReceiptBytes) so a large receipt is parsed without a
	// surprise allocation and anything larger is rejected by MaxBytesReader
	// in the handler before it is buffered.
	maxMultipartMemory = 10 << 20

	// startupMigrationTimeout caps how long we'll spend backfilling legacy
	// users into the new role/fleet model before failing startup. Mirrors the
	// 60s ceiling enforced inside the database package.
	startupMigrationTimeout = 60 * time.Second
)

func main() {
	// Load .env file (ignored if absent — env vars take precedence in prod).
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	if os.Getenv(envJWTSecret) == "" {
		log.Fatal("JWT_SECRET environment variable not set")
	}
	// HS256 needs a >=256-bit key. Reject a too-short secret at boot rather
	// than silently signing tokens with a weak key.
	if len(os.Getenv(envJWTSecret)) < minJWTSecretLen {
		log.Fatalf("JWT_SECRET must be at least %d characters (256-bit key for HS256)", minJWTSecretLen)
	}

	mongoURI := os.Getenv(envMongoURI)
	if mongoURI == "" {
		log.Fatal("MONGODB_URI environment variable not set")
	}

	// Transactional email is required in production: without it new owners can
	// never verify and locked-out users can never reset. In dev the email
	// service no-ops (logging the would-be send) so local flows still work.
	if os.Getenv(envGinMode) == ginReleaseMode {
		if os.Getenv(envResendAPIKey) == "" {
			log.Fatal("RESEND_API_KEY environment variable not set in release mode")
		}
		if os.Getenv(envEmailFrom) == "" {
			log.Fatal("EMAIL_FROM environment variable not set in release mode")
		}
	}

	// Billing: require Stripe config in production so a release build can never
	// silently run without the webhook that drives entitlement. In dev, billing
	// endpoints degrade to a friendly 503 when unset.
	if os.Getenv(envGinMode) == ginReleaseMode {
		if os.Getenv(envStripeSecret) == "" {
			log.Fatal("STRIPE_SECRET_KEY environment variable not set in release mode")
		}
		if os.Getenv(envStripeWebhookSecret) == "" {
			log.Fatal("STRIPE_WEBHOOK_SECRET environment variable not set in release mode")
		}
	}
	controllers.InitStripe()

	database.Connect(mongoURI)

	// Backfill legacy users into the role/fleet model. Idempotent — re-runs
	// after every restart are no-ops once every user is migrated. Failure is
	// fatal: starting up against a partially-migrated dataset would let
	// pre-migration users in without a role claim and break authorization
	// invariants downstream.
	migrationCtx, cancelMigration := context.WithTimeout(context.Background(), startupMigrationTimeout)
	defer cancelMigration()
	if err := database.RunMigration(migrationCtx); err != nil {
		log.Fatalf("Failed to run startup migration: %v", err)
	}

	router := gin.Default()
	configureTrustedProxies(router)

	// Cap the multipart parser's in-memory buffer at the receipt size limit.
	// The scan handler additionally wraps the body in http.MaxBytesReader so a
	// payload larger than this is rejected before it is fully buffered.
	router.MaxMultipartMemory = maxMultipartMemory

	// Security headers FIRST so they land on every response, including
	// the 400 emitted by RequireHTTPS and the 429 emitted by the rate limiter.
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.RequireHTTPS())

	// CORS must be configured explicitly. An unset ALLOWED_ORIGIN in release
	// mode is a misconfiguration, not a "skip CORS" signal.
	router.Use(cors.New(buildCORSConfig()))

	routes.SetupRoutes(router)
	routes.SetupProtectedRoutes(router)

	// Health check — exempted from RequireHTTPS so platform probes work.
	router.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	port := os.Getenv(envPort)
	if port == "" {
		port = defaultPort
	}

	if err := router.Run(":" + port); err != nil {
		// log.Fatalf prints + exits non-zero so Render restarts the container
		// instead of leaving a zombie process that "started" but is not serving.
		log.Fatalf("Failed to start server: %v", err)
	}
}

// configureTrustedProxies tells Gin which proxy hops to trust when reading
// X-Forwarded-For / X-Forwarded-Proto. In release mode we accept the upstream
// platform proxy (Render does not publish a stable CIDR, so we trust the
// loopback + RFC1918 ranges that Render's edge uses to reach us); in dev we
// disable proxy trust entirely so spoofed headers cannot influence ClientIP().
func configureTrustedProxies(router *gin.Engine) {
	if gin.Mode() == gin.ReleaseMode {
		// Trust private ranges Render uses to forward to the container.
		// Tighten to a specific CIDR if/when the platform publishes one.
		if err := router.SetTrustedProxies([]string{
			"10.0.0.0/8",
			"172.16.0.0/12",
			"192.168.0.0/16",
			"127.0.0.1/32",
			"::1/128",     // IPv6 loopback (Render's internal proxy hop)
			"fc00::/7",    // IPv6 unique-local (RFC4193)
			"fe80::/10",   // IPv6 link-local
		}); err != nil {
			log.Fatalf("failed to configure trusted proxies: %v", err)
		}
		return
	}
	// Dev: do not trust any proxy headers.
	if err := router.SetTrustedProxies(nil); err != nil {
		log.Fatalf("failed to clear trusted proxies: %v", err)
	}
}

// buildCORSConfig resolves ALLOWED_ORIGIN with mode-aware defaults and
// validates that it is compatible with AllowCredentials=true.
func buildCORSConfig() cors.Config {
	allowedOrigin := os.Getenv(envAllowedOrigin)
	if allowedOrigin == "" {
		if gin.Mode() == gin.ReleaseMode {
			log.Fatal("ALLOWED_ORIGIN environment variable not set in release mode")
		}
		allowedOrigin = defaultDevAllowOrigin
		log.Printf("ALLOWED_ORIGIN not set; defaulting to %s for local dev", allowedOrigin)
	}
	if allowedOrigin == "*" {
		// AllowCredentials=true is incompatible with wildcard per the CORS spec.
		log.Fatal("ALLOWED_ORIGIN=* is not permitted (incompatible with credentialed requests)")
	}
	return cors.Config{
		AllowOrigins:     []string{allowedOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Set-Cookie"},
		AllowCredentials: true,
	}
}
