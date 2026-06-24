package controllers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gabriel-vasile/mimetype"
	"github.com/gin-gonic/gin"
)

// Receipt scanning configuration.
//
// The scanner is deliberately stateless: the uploaded image is streamed to
// Gemini, parsed, and discarded. Nothing is written to disk or object storage,
// which sidesteps the public-path / malware-at-rest risks of stored uploads —
// the bytes never outlive the request.
const (
	envGeminiKey   = "GEMINI_API_KEY"
	geminiModel    = "gemini-2.5-flash-lite"
	geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent"

	// maxReceiptBytes mirrors the 10 MB limit advertised in the SPA upload UI.
	// Enforced server-side regardless of what the client claims.
	maxReceiptBytes = 10 << 20

	// scanTimeout bounds the whole Gemini round-trip. Vision calls on a large
	// image are slower than a DB op, hence wider than dbTimeout.
	scanTimeout = 25 * time.Second
)

// allowedReceiptTypes is the server-side allowlist of receipt formats. Matched
// against the MIME type SNIFFED FROM THE BYTES, never the client-supplied
// extension or Content-Type header.
var allowedReceiptTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"application/pdf": true,
}

// receiptPrompt instructs the model. Category is constrained to the same
// vocabulary the SPA's expense presets use so the prefill lands on a known
// chip; the field is still free-form server-side (see CreateExpense).
const receiptPrompt = `You are a receipt parser for a trucking expense app. Read this receipt and extract:
- amount: the grand total paid, as a number with no currency symbol.
- date: the transaction date as YYYY-MM-DD. If you cannot read it, use an empty string.
- category: one lowercase word from: fuel, maintenance, repairs, tires, insurance, tolls, permits, parking, meals, lodging, other.
- vendor: the merchant or station name.
- gallons: fuel gallons if this is a fuel purchase, otherwise 0.
Return only the structured data.`

// receiptSchema is Gemini's responseSchema — forcing structured JSON output so
// we never have to scrape free text out of a prose reply.
var receiptSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"amount":   map[string]any{"type": "number"},
		"date":     map[string]any{"type": "string"},
		"category": map[string]any{"type": "string"},
		"vendor":   map[string]any{"type": "string"},
		"gallons":  map[string]any{"type": "number"},
	},
	"required": []string{"amount", "date", "category", "vendor"},
}

// ReceiptScan is the extracted, normalized result returned to the SPA. It is
// NOT a persisted document — the client uses it to prefill the Add Entry modal.
type ReceiptScan struct {
	Amount   float64 `json:"amount"`
	Date     string  `json:"date"`
	Category string  `json:"category"`
	Vendor   string  `json:"vendor"`
	Gallons  float64 `json:"gallons,omitempty"`
}

// Gemini generateContent request/response shapes — only the fields we use.
type geminiInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inline_data,omitempty"`
}

type geminiRequest struct {
	Contents []struct {
		Parts []geminiPart `json:"parts"`
	} `json:"contents"`
	GenerationConfig struct {
		ResponseMimeType string         `json:"responseMimeType"`
		ResponseSchema   map[string]any `json:"responseSchema"`
	} `json:"generationConfig"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

// ScanReceipt reads a receipt image and returns the extracted expense fields.
//
// Owner-only (mounted in the owner group): expenses are owner-scoped, and this
// endpoint is the data-entry assist for them. It creates nothing — the SPA
// prefills the Add Entry modal so a human confirms every value before save.
//
// SECURITY: MIME type is sniffed from the bytes, size is hard-capped before
// the upstream call, and the image is never persisted. Upstream failures are
// logged server-side and returned as a generic 502 so no key/quota detail leaks.
func ScanReceipt(c *gin.Context) {
	apiKey := os.Getenv(envGeminiKey)
	if apiKey == "" {
		// Not an error — the feature is simply unconfigured. Tell the user
		// plainly so they fall back to manual entry instead of seeing a 500.
		log.Printf("ScanReceipt: %s not configured; scanner disabled", envGeminiKey)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Receipt scanning isn't set up yet. Add the entry manually for now."})
		return
	}

	// Cap the request body BEFORE the multipart parser reads it, so an
	// oversized upload is rejected without buffering the whole payload into
	// memory. FormFile triggers the parse; MaxBytesReader makes that parse
	// fail fast once the limit is exceeded. The fileHeader.Size and
	// LimitReader checks below remain as belt-and-suspenders backstops.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxReceiptBytes)

	fileHeader, err := c.FormFile("receipt")
	if err != nil {
		// A body exceeding maxReceiptBytes surfaces here as a parse failure.
		// Treat it as "too large" rather than a generic bad request so the
		// user gets actionable copy.
		if strings.Contains(err.Error(), "request body too large") {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "That file is too large — keep receipts under 10 MB"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "Attach a receipt image to scan"})
		return
	}
	if fileHeader.Size > maxReceiptBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "That file is too large — keep receipts under 10 MB"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		log.Printf("ScanReceipt: open upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn't read that file"})
		return
	}
	defer f.Close()

	// LimitReader is a second backstop in case FormFile.Size is understated.
	data, err := io.ReadAll(io.LimitReader(f, maxReceiptBytes))
	if err != nil {
		log.Printf("ScanReceipt: read upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Couldn't read that file"})
		return
	}

	mtype := mimetype.Detect(data)
	if !allowedReceiptTypes[mtype.String()] {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "Upload a JPG, PNG, WEBP or PDF receipt"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), scanTimeout)
	defer cancel()

	scan, err := extractReceiptFields(ctx, apiKey, data, mtype.String())
	if err != nil {
		log.Printf("ScanReceipt: extraction failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Couldn't read that receipt. Try a clearer photo or add the entry manually."})
		return
	}

	c.JSON(http.StatusOK, scan)
}

// extractReceiptFields sends the image to Gemini and returns the normalized
// fields. The returned values are clamped to the same trust boundary
// CreateExpense enforces so a hostile or garbled model reply cannot smuggle a
// bad value into the prefill.
func extractReceiptFields(ctx context.Context, apiKey string, image []byte, mimeType string) (*ReceiptScan, error) {
	var reqBody geminiRequest
	reqBody.Contents = []struct {
		Parts []geminiPart `json:"parts"`
	}{{
		Parts: []geminiPart{
			{Text: receiptPrompt},
			{InlineData: &geminiInlineData{MimeType: mimeType, Data: base64.StdEncoding.EncodeToString(image)}},
		},
	}}
	reqBody.GenerationConfig.ResponseMimeType = "application/json"
	reqBody.GenerationConfig.ResponseSchema = receiptSchema

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, geminiEndpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// Key travels in a header, not the query string, so it never lands in proxy
	// or access logs.
	req.Header.Set("x-goog-api-key", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini call: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read gemini response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		// Log the upstream body for diagnostics; never return it to the client.
		return nil, fmt.Errorf("gemini status %d: %s", resp.StatusCode, string(body))
	}

	var gr geminiResponse
	if err := json.Unmarshal(body, &gr); err != nil {
		return nil, fmt.Errorf("decode gemini envelope: %w", err)
	}
	if len(gr.Candidates) == 0 || len(gr.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini returned no candidates")
	}

	var scan ReceiptScan
	if err := json.Unmarshal([]byte(gr.Candidates[0].Content.Parts[0].Text), &scan); err != nil {
		return nil, fmt.Errorf("decode receipt json: %w", err)
	}

	scan.Category = strings.ToLower(strings.TrimSpace(scan.Category))
	scan.Vendor = strings.TrimSpace(scan.Vendor)
	if scan.Amount < 0 || math.IsNaN(scan.Amount) || math.IsInf(scan.Amount, 0) {
		scan.Amount = 0
	}
	if scan.Gallons < 0 || math.IsNaN(scan.Gallons) || math.IsInf(scan.Gallons, 0) {
		scan.Gallons = 0
	}
	return &scan, nil
}
