package controllers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// badRequest writes a generic HTTP 400 response while logging the underlying
// error server-side.
//
// SECURITY: validator and json bind errors are not safe to surface verbatim —
// they expose internal struct field names and validation tag rules, which is
// fingerprintable and occasionally reveals schema details. Use this helper
// everywhere user-supplied input fails to bind or validate.
//
// The caller is responsible for returning immediately after invoking this
// helper; it does not abort the request itself.
func badRequest(c *gin.Context, err error, msg string) {
	log.Printf("bad request on %s: %v", c.FullPath(), err)
	c.JSON(http.StatusBadRequest, gin.H{"error": msg})
}
