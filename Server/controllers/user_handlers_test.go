package controllers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/database"
	"github.com/Ken-Smit/RigLedgerServer/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// envMongoTestURI points at a THROWAWAY MongoDB. database.Connect always uses
// the "rigledger" database, so never aim this at a dev or production cluster.
const envMongoTestURI = "MONGODB_TEST_URI"

// Deleting an owner must remove the fleet's HOS logs along with the fleet, and
// must not touch another fleet's logs.
func TestDeleteOwnerCascadesHOSLogs(t *testing.T) {
	uri := os.Getenv(envMongoTestURI)
	if uri == "" {
		t.Skipf("%s not set; skipping MongoDB integration test", envMongoTestURI)
	}
	database.Connect(uri)
	gin.SetMode(gin.TestMode)
	ctx := context.Background()

	ownerID := bson.NewObjectID()
	fleetID := bson.NewObjectID()
	otherFleetID := bson.NewObjectID().Hex()

	mustInsert(t, database.GetFleetCollection(), bson.M{"_id": fleetID})
	mustInsert(t, database.GetUserCollection(), bson.M{"_id": ownerID, "fleet_id": fleetID.Hex(), "role": models.RoleOwner})
	mustInsert(t, database.GetHosLogCollection(), bson.M{"fleet_id": fleetID.Hex(), "driver_id": ownerID.Hex(), "status": "driving", "changed_at": time.Now()})
	mustInsert(t, database.GetHosLogCollection(), bson.M{"fleet_id": otherFleetID, "driver_id": "someone-else", "status": "off", "changed_at": time.Now()})
	t.Cleanup(func() {
		_, _ = database.GetHosLogCollection().DeleteMany(ctx, bson.M{"fleet_id": otherFleetID})
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/api/v1/user/profile", nil)
	c.Set("userID", ownerID.Hex())
	c.Set("fleetID", fleetID.Hex())
	c.Set("role", models.RoleOwner)

	DeleteUser(c)

	if w.Code != http.StatusOK {
		t.Fatalf("DeleteUser: got %d (%s), want 200", w.Code, w.Body.String())
	}
	if n := countDocs(t, database.GetHosLogCollection(), bson.M{"fleet_id": fleetID.Hex()}); n != 0 {
		t.Errorf("deleted fleet still has %d HOS logs, want 0", n)
	}
	if n := countDocs(t, database.GetHosLogCollection(), bson.M{"fleet_id": otherFleetID}); n != 1 {
		t.Errorf("other fleet has %d HOS logs, want 1 (cascade leaked across tenants)", n)
	}
}

func mustInsert(t *testing.T, col *mongo.Collection, doc bson.M) {
	t.Helper()
	if _, err := col.InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("insert into %s: %v", col.Name(), err)
	}
}

func countDocs(t *testing.T, col *mongo.Collection, filter bson.M) int64 {
	t.Helper()
	n, err := col.CountDocuments(context.Background(), filter)
	if err != nil {
		t.Fatalf("count %s: %v", col.Name(), err)
	}
	return n
}
