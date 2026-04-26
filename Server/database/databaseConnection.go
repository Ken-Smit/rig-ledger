package database

import (
	"context"
	"errors"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// indexBuildTimeout caps the synchronous index-creation phase at startup. Index
// builds on tiny collections finish in milliseconds; the 30-second ceiling
// guards against a network blip pinning startup forever without forcing a long
// outage if Atlas is sluggish.
const indexBuildTimeout = 30 * time.Second

// MongoDB server error codes we tolerate during ensureIndexes.
//   - 85 IndexOptionsConflict  — same key, different options.
//   - 86 IndexKeySpecsConflict — same name, different keys.
//
// Both indicate an existing index that diverges from our spec. We log and move
// on rather than crashing because a manual index from the past should not block
// startup; ops can reconcile out-of-band. Genuine errors (auth, network, etc.)
// still abort startup.
const (
	mongoIndexOptionsConflict  = 85
	mongoIndexKeySpecsConflict = 86
)

var client *mongo.Client

// Connect initializes the MongoDB connection and ensures required indexes exist.
func Connect(mongoURI string) {
	var err error
	opts := options.Client().ApplyURI(mongoURI).SetServerSelectionTimeout(10 * time.Second)
	client, err = mongo.Connect(opts)
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	// Test the connection with a bounded timeout so we fail fast on bad URIs / blocked IPs.
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer pingCancel()
	if err = client.Ping(pingCtx, nil); err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	// Index creation is mandatory: every list/lookup query in the controllers
	// is written assuming these indexes exist. Running without them would
	// silently degrade to collection scans and breach CLAUDE.md's perf rules.
	idxCtx, idxCancel := context.WithTimeout(context.Background(), indexBuildTimeout)
	defer idxCancel()
	if err := ensureIndexes(idxCtx); err != nil {
		log.Fatal("Failed to ensure indexes:", err)
	}

	log.Println("Connected to MongoDB successfully")
}

// ensureIndexes installs the indexes required by user/truck/expense queries.
// Tolerates pre-existing conflicting indexes (codes 85/86) so reruns after a
// manual ops reconciliation do not crash the service.
func ensureIndexes(ctx context.Context) error {
	if err := ensureUserIndexes(ctx); err != nil {
		return err
	}
	if err := ensureTruckIndexes(ctx); err != nil {
		return err
	}
	return ensureExpenseIndexes(ctx)
}

// ensureUserIndexes creates the unique email index. Server-side uniqueness is
// the authoritative check — the application-level pre-check in Register has a
// race window. Two concurrent registrations with the same email will both pass
// the FindOne; only the database constraint can reject the loser cleanly.
func ensureUserIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetName("uniq_email").SetUnique(true),
		},
	}
	return createIndexes(ctx, GetUserCollection(), models)
}

// ensureTruckIndexes creates a (user_id, _id) compound. Covers GetUserTrucks
// (filter by user_id, sort by _id) and assertTruckOwned (equality on both).
func ensureTruckIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "_id", Value: 1}},
			Options: options.Index().SetName("user_id_id"),
		},
	}
	return createIndexes(ctx, GetTruckCollection(), models)
}

// ensureExpenseIndexes creates two compounds:
//   - (user_id, date desc): supports GetExpenses sort-by-date listing.
//   - (user_id, truck_id):  supports per-truck filtering when that lands.
func ensureExpenseIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}},
			Options: options.Index().SetName("user_id_date_desc"),
		},
		{
			Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "truck_id", Value: 1}},
			Options: options.Index().SetName("user_id_truck_id"),
		},
	}
	return createIndexes(ctx, GetExpenseCollection(), models)
}

// createIndexes runs CreateMany and folds away the two recoverable conflict
// codes. Any other error (auth, network, unexpected schema collisions) bubbles
// up as fatal — bad index state is a startup bug we surface, not paper over.
func createIndexes(ctx context.Context, col *mongo.Collection, models []mongo.IndexModel) error {
	_, err := col.Indexes().CreateMany(ctx, models)
	if err == nil {
		return nil
	}
	var cmdErr mongo.CommandError
	if errors.As(err, &cmdErr) {
		if cmdErr.Code == mongoIndexOptionsConflict || cmdErr.Code == mongoIndexKeySpecsConflict {
			log.Printf("ensureIndexes: tolerated conflict on %s: %v", col.Name(), cmdErr)
			return nil
		}
	}
	return err
}

// GetUserCollection returns the users collection.
func GetUserCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("users")
}

// GetTruckCollection returns the trucks collection.
func GetTruckCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("trucks")
}

// GetExpenseCollection returns the expenses collection.
func GetExpenseCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("expenses")
}

// Disconnect closes the MongoDB connection.
func Disconnect() {
	if err := client.Disconnect(context.Background()); err != nil {
		log.Fatal("Failed to disconnect from MongoDB:", err)
	}
}
