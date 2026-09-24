package controllers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const maxIftaMiles = 1_000_000   // sanity cap per single segment entry
const maxIftaGallons = 100_000.0 // sanity cap per single fuel entry

// quarterRange returns the [start, end) YYYY-MM-DD bounds of a calendar
// quarter. End is the first day of the next quarter (exclusive), so a simple
// lexical string range filters the date field correctly.
func quarterRange(year, quarter int) (string, string) {
	startMonth := (quarter-1)*3 + 1
	start := fmt.Sprintf("%04d-%02d-01", year, startMonth)
	endYear, endMonth := year, startMonth+3
	if endMonth > 12 {
		endMonth -= 12
		endYear++
	}
	return start, fmt.Sprintf("%04d-%02d-01", endYear, endMonth)
}

// parseYearQuarter reads + validates ?year=&quarter= from the query string.
func parseYearQuarter(c *gin.Context) (year, quarter int, ok bool) {
	y, err1 := strconv.Atoi(c.Query("year"))
	q, err2 := strconv.Atoi(c.Query("quarter"))
	if err1 != nil || err2 != nil || y < 2000 || y > 2100 || q < 1 || q > 4 {
		return 0, 0, false
	}
	return y, q, true
}

// validateIftaEntry normalizes + validates the fields shared by both entry
// kinds. Returns an HTTP status (0 = ok) and a client-safe message.
func validateIftaEntry(ctx context.Context, fleetID, truckIDHex, date, jurisdiction string) (bson.ObjectID, string, int, string) {
	juris := strings.ToUpper(strings.TrimSpace(jurisdiction))
	if !isIftaJurisdiction(juris) {
		return bson.NilObjectID, "", http.StatusBadRequest, "Select a valid US IFTA jurisdiction"
	}
	if !isCalendarDate(date) {
		return bson.NilObjectID, "", http.StatusBadRequest, "Enter a valid date"
	}
	truckObjID, err := bson.ObjectIDFromHex(truckIDHex)
	if err != nil {
		return bson.NilObjectID, "", http.StatusBadRequest, "Invalid truck ID"
	}
	if err := assertTruckInFleet(ctx, truckObjID, fleetID); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return bson.NilObjectID, "", http.StatusNotFound, "Truck not found"
		}
		log.Printf("IFTA: truck lookup failed fleet=%s truck=%s: %v", fleetID, truckIDHex, err)
		return bson.NilObjectID, "", http.StatusInternalServerError, "Failed to save entry"
	}
	return truckObjID, juris, 0, ""
}

// CreateIftaMiles logs one trip segment (miles in a jurisdiction on a date).
func CreateIftaMiles(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	var req models.IftaMilesRequest
	if !decodeStrict(c, &req) {
		return
	}
	if math.IsNaN(req.Miles) || math.IsInf(req.Miles, 0) || req.Miles <= 0 || req.Miles > maxIftaMiles {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Miles must be greater than zero"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	truckObjID, juris, status, msg := validateIftaEntry(ctx, fleetID, req.TruckID, req.Date, req.Jurisdiction)
	if status != 0 {
		c.JSON(status, gin.H{"error": msg})
		return
	}

	entry := models.IftaMiles{
		ID:           bson.NewObjectID(),
		FleetID:      fleetID,
		TruckID:      truckObjID.Hex(),
		Date:         req.Date,
		Jurisdiction: juris,
		Miles:        req.Miles,
		CreatedAt:    time.Now(),
	}
	if _, err := database.GetIftaMilesCollection().InsertOne(ctx, entry); err != nil {
		log.Printf("CreateIftaMiles: insert failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save mileage"})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

// CreateIftaFuel logs one fuel purchase (gallons in a jurisdiction on a date).
func CreateIftaFuel(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	var req models.IftaFuelRequest
	if !decodeStrict(c, &req) {
		return
	}
	if math.IsNaN(req.Gallons) || math.IsInf(req.Gallons, 0) || req.Gallons <= 0 || req.Gallons > maxIftaGallons {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Gallons must be greater than zero"})
		return
	}
	if math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) || req.Amount < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Amount must be zero or more"})
		return
	}

	ctx, cancel := dbCtx(c)
	defer cancel()

	truckObjID, juris, status, msg := validateIftaEntry(ctx, fleetID, req.TruckID, req.Date, req.Jurisdiction)
	if status != 0 {
		c.JSON(status, gin.H{"error": msg})
		return
	}

	entry := models.IftaFuel{
		ID:           bson.NewObjectID(),
		FleetID:      fleetID,
		TruckID:      truckObjID.Hex(),
		Date:         req.Date,
		Jurisdiction: juris,
		Gallons:      req.Gallons,
		Amount:       req.Amount,
		CreatedAt:    time.Now(),
	}
	if _, err := database.GetIftaFuelCollection().InsertOne(ctx, entry); err != nil {
		log.Printf("CreateIftaFuel: insert failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save fuel"})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

// listIftaEntries is the shared list path for both collections: fleet-scoped,
// filtered to the requested quarter, newest-first. results must be a pointer to
// a slice the cursor can decode into.
func listIftaEntries(c *gin.Context, col *mongo.Collection, results any) bool {
	fleetID := c.GetString("fleetID")
	year, quarter, ok := parseYearQuarter(c)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "year and quarter (1-4) are required"})
		return false
	}
	start, end := quarterRange(year, quarter)

	ctx, cancel := dbCtx(c)
	defer cancel()

	filter := bson.M{"fleet_id": fleetID, "date": bson.M{"$gte": start, "$lt": end}}
	cur, err := col.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "date", Value: -1}}))
	if err != nil {
		log.Printf("listIftaEntries: find failed fleet=%s col=%s: %v", fleetID, col.Name(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load entries"})
		return false
	}
	if err := cur.All(ctx, results); err != nil {
		log.Printf("listIftaEntries: decode failed fleet=%s col=%s: %v", fleetID, col.Name(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load entries"})
		return false
	}
	return true
}

// ListIftaMiles returns the fleet's trip segments for a quarter.
func ListIftaMiles(c *gin.Context) {
	entries := []models.IftaMiles{}
	if listIftaEntries(c, database.GetIftaMilesCollection(), &entries) {
		c.JSON(http.StatusOK, entries)
	}
}

// ListIftaFuel returns the fleet's fuel purchases for a quarter.
func ListIftaFuel(c *gin.Context) {
	entries := []models.IftaFuel{}
	if listIftaEntries(c, database.GetIftaFuelCollection(), &entries) {
		c.JSON(http.StatusOK, entries)
	}
}

// deleteIftaEntry removes one fleet-scoped entry by id. fleet_id in the filter
// makes a cross-tenant id match zero documents → 404.
func deleteIftaEntry(c *gin.Context, col *mongo.Collection, label string) {
	fleetID := c.GetString("fleetID")
	objID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid entry ID"})
		return
	}
	ctx, cancel := dbCtx(c)
	defer cancel()

	res, err := col.DeleteOne(ctx, bson.M{"_id": objID, "fleet_id": fleetID})
	if err != nil {
		log.Printf("deleteIftaEntry(%s): delete failed fleet=%s id=%s: %v", label, fleetID, objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete entry"})
		return
	}
	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Entry not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Entry deleted"})
}

// DeleteIftaMiles removes one trip segment.
func DeleteIftaMiles(c *gin.Context) {
	deleteIftaEntry(c, database.GetIftaMilesCollection(), "miles")
}

// DeleteIftaFuel removes one fuel purchase.
func DeleteIftaFuel(c *gin.Context) {
	deleteIftaEntry(c, database.GetIftaFuelCollection(), "fuel")
}

// GetIftaReturn computes the quarterly IFTA return from the fleet's logged
// miles + fuel. Taxable gallons for a jurisdiction are its miles divided by the
// fleet's average MPG; tax owed is taxable gallons * rate, tax paid is gallons
// purchased there * rate, and net is the difference.
func GetIftaReturn(c *gin.Context) {
	fleetID := c.GetString("fleetID")
	year, quarter, ok := parseYearQuarter(c)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "year and quarter (1-4) are required"})
		return
	}
	start, end := quarterRange(year, quarter)

	ctx, cancel := dbCtx(c)
	defer cancel()

	filter := bson.M{"fleet_id": fleetID, "date": bson.M{"$gte": start, "$lt": end}}

	var miles []models.IftaMiles
	if cur, err := database.GetIftaMilesCollection().Find(ctx, filter); err != nil {
		log.Printf("GetIftaReturn: miles find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build return"})
		return
	} else if err := cur.All(ctx, &miles); err != nil {
		log.Printf("GetIftaReturn: miles decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build return"})
		return
	}

	var fuel []models.IftaFuel
	if cur, err := database.GetIftaFuelCollection().Find(ctx, filter); err != nil {
		log.Printf("GetIftaReturn: fuel find failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build return"})
		return
	} else if err := cur.All(ctx, &fuel); err != nil {
		log.Printf("GetIftaReturn: fuel decode failed fleet=%s: %v", fleetID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build return"})
		return
	}

	milesByJur := map[string]float64{}
	gallonsByJur := map[string]float64{}
	var totalMiles, totalGallons float64
	for _, m := range miles {
		milesByJur[m.Jurisdiction] += m.Miles
		totalMiles += m.Miles
	}
	for _, f := range fuel {
		gallonsByJur[f.Jurisdiction] += f.Gallons
		totalGallons += f.Gallons
	}

	var fleetMPG float64
	if totalGallons > 0 {
		fleetMPG = totalMiles / totalGallons
	}

	// Union of jurisdictions seen in either dataset.
	seen := map[string]bool{}
	for j := range milesByJur {
		seen[j] = true
	}
	for j := range gallonsByJur {
		seen[j] = true
	}
	jurs := make([]string, 0, len(seen))
	for j := range seen {
		jurs = append(jurs, j)
	}
	sort.Strings(jurs)

	lines := make([]models.IftaReturnLine, 0, len(jurs))
	var netTax float64
	for _, j := range jurs {
		rate, rated := rateFor(j)
		var taxableGallons float64
		if fleetMPG > 0 {
			taxableGallons = milesByJur[j] / fleetMPG
		}
		purchased := gallonsByJur[j]
		taxOwed := taxableGallons * rate
		taxPaid := purchased * rate
		net := taxOwed - taxPaid
		netTax += net
		lines = append(lines, models.IftaReturnLine{
			Jurisdiction:     j,
			Miles:            milesByJur[j],
			PurchasedGallons: purchased,
			TaxableGallons:   taxableGallons,
			TaxRate:          rate,
			TaxOwed:          taxOwed,
			TaxPaid:          taxPaid,
			Net:              net,
			Rated:            rated,
		})
	}

	c.JSON(http.StatusOK, models.IftaReturn{
		Year:         year,
		Quarter:      quarter,
		TotalMiles:   totalMiles,
		TotalGallons: totalGallons,
		FleetMPG:     fleetMPG,
		NetTax:       netTax,
		Lines:        lines,
	})
}
