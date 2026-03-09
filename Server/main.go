package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/routes"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Require JWT secret
	if os.Getenv("JWT_SECRET") == "" {
		log.Fatal("JWT_SECRET environment variable not set")
	}

	// Initialize MongoDB
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		log.Fatal("MONGODB_URI environment variable not set")
	}
	database.Connect(mongoURI)

	router := gin.Default()

	// CORS only needed for local dev (frontend on different port)
	if allowedOrigin := os.Getenv("ALLOWED_ORIGIN"); allowedOrigin != "" {
		router.Use(cors.New(cors.Config{
			AllowOrigins:     []string{allowedOrigin},
			AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Content-Type"},
			AllowCredentials: true,
		}))
	}

	// API routes
	routes.SetupRoutes(router)
	routes.SetupProtectedRoutes(router)

	// Health check
	router.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// Serve React static files
	staticDir := "./static"
	router.Static("/assets", filepath.Join(staticDir, "assets"))

	// SPA fallback: serve static files first, then index.html
	router.NoRoute(func(c *gin.Context) {
		// Try to serve the file from static dir
		filePath := filepath.Join(staticDir, c.Request.URL.Path)
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			c.File(filePath)
			return
		}
		// Fallback to index.html for SPA routing
		c.File(filepath.Join(staticDir, "index.html"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if err := router.Run(":" + port); err != nil {
		fmt.Println("Failed to start server", err)
	}
}
