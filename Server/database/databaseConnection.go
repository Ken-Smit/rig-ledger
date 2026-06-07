package database

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/models"
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

// ensureIndexes installs the indexes required by user/truck/expense/fleet/
// invite/mileage_log queries. Tolerates pre-existing conflicting indexes
// (codes 85/86) so reruns after a manual ops reconciliation do not crash the
// service.
func ensureIndexes(ctx context.Context) error {
	if err := ensureUserIndexes(ctx); err != nil {
		return err
	}
	if err := ensureTruckIndexes(ctx); err != nil {
		return err
	}
	if err := ensureExpenseIndexes(ctx); err != nil {
		return err
	}
	if err := ensureFleetIndexes(ctx); err != nil {
		return err
	}
	if err := ensureInviteIndexes(ctx); err != nil {
		return err
	}
	if err := ensureMileageLogIndexes(ctx); err != nil {
		return err
	}
	return ensureLoadIndexes(ctx)
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

// ensureTruckIndexes creates two compounds:
//   - (user_id, _id):  legacy lookup path retained for owner self-listings.
//   - (fleet_id, _id): covers fleet-scoped listing + ownership assertion under
//     the new fleet model. Drivers list trucks by fleet_id; owners verify a
//     truck belongs to their fleet on every mutation.
func ensureTruckIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "_id", Value: 1}},
			Options: options.Index().SetName("user_id_id"),
		},
		{
			Keys:    bson.D{{Key: "fleet_id", Value: 1}, {Key: "_id", Value: 1}},
			Options: options.Index().SetName("fleet_id_id"),
		},
	}
	return createIndexes(ctx, GetTruckCollection(), models)
}

// ensureExpenseIndexes creates compounds for the legacy user-scoped queries
// (kept for owner self-listing) and the new fleet-scoped queries.
//   - (user_id, date desc): legacy GetExpenses listing.
//   - (user_id, truck_id):  legacy per-truck filtering.
//   - (fleet_id, date desc): fleet-wide listing under the new model — drivers
//     and owners alike read by fleet, sorted newest-first.
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
		{
			Keys:    bson.D{{Key: "fleet_id", Value: 1}, {Key: "date", Value: -1}},
			Options: options.Index().SetName("fleet_id_date_desc"),
		},
	}
	return createIndexes(ctx, GetExpenseCollection(), models)
}

// ensureFleetIndexes creates a non-unique (owner_id) index. A user can in
// principle own multiple fleets, but every owner-scoped lookup ("show me my
// fleet") filters on owner_id and benefits from the index.
func ensureFleetIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "owner_id", Value: 1}},
			Options: options.Index().SetName("owner_id"),
		},
	}
	return createIndexes(ctx, GetFleetCollection(), models)
}

// ensureInviteIndexes creates:
//   - unique (token_hash):     constant-time lookup on the SHA-256 digest used
//     to redeem an invite. Uniqueness defends against a bug that issues
//     duplicate hashes — the database forces the loser to retry.
//   - (fleet_id):              for "list invites for my fleet" admin views.
//   - TTL on expires_at:       Mongo automatically reaps expired invites.
//     expireAfterSeconds=0 means "delete as soon as expires_at is in the past"
//     — the field itself is the deadline.
func ensureInviteIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "token_hash", Value: 1}},
			Options: options.Index().SetName("uniq_token_hash").SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "fleet_id", Value: 1}},
			Options: options.Index().SetName("fleet_id"),
		},
		{
			Keys:    bson.D{{Key: "expires_at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0),
		},
	}
	return createIndexes(ctx, GetInviteCollection(), models)
}

// ensureLoadIndexes creates the indexes that back every Load query path:
//   - (fleet_id, created_at desc):           owner overview, newest-first.
//   - (driver_id, status, scheduled_pickup): driver "today / queue" — the hot
//     read path on every driver phone fetch. Composite includes status so the
//     "in progress" + "pending today" sections can be served from one index.
//   - (fleet_id, status, created_at desc):   owner status-filtered listings.
//   - (truck_id, created_at desc):           optional per-truck history.
//
// scheduled_pickup_at is denormalized into the load document at write time
// from stops[0] (the earliest sequence stop, always a pickup per the
// validator). Indexing through stops.scheduled_at would create a multikey
// index across an array — correct but harder to reason about and slower
// than indexing a denormalized scalar.
func ensureLoadIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "fleet_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("fleet_id_created_at_desc"),
		},
		{
			Keys: bson.D{
				{Key: "driver_id", Value: 1},
				{Key: "status", Value: 1},
				{Key: "scheduled_pickup_at", Value: 1},
			},
			Options: options.Index().SetName("driver_status_pickup"),
		},
		{
			Keys: bson.D{
				{Key: "fleet_id", Value: 1},
				{Key: "status", Value: 1},
				{Key: "created_at", Value: -1},
			},
			Options: options.Index().SetName("fleet_status_created_desc"),
		},
		{
			Keys:    bson.D{{Key: "truck_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("truck_id_created_at_desc"),
		},
	}
	return createIndexes(ctx, GetLoadCollection(), models)
}

// ensureMileageLogIndexes creates:
//   - unique (fleet_id, truck_id, date): natural key for upserts. Prevents
//     two writers from inserting parallel rows for the same truck/day.
//   - (truck_id, date desc):             per-truck history listing.
func ensureMileageLogIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "fleet_id", Value: 1},
				{Key: "truck_id", Value: 1},
				{Key: "date", Value: 1},
			},
			Options: options.Index().SetName("uniq_fleet_truck_date").SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "truck_id", Value: 1}, {Key: "date", Value: -1}},
			Options: options.Index().SetName("truck_id_date_desc"),
		},
	}
	return createIndexes(ctx, GetMileageLogCollection(), models)
}

// createIndexes runs CreateMany and folds away the two recoverable conflict
// codes. Any other error (auth, network, unexpected schema collisions) bubbles
// up as fatal — bad index state is a startup bug we surface, not paper over.
func createIndexes(ctx context.Context, col *mongo.Collection, indexModels []mongo.IndexModel) error {
	_, err := col.Indexes().CreateMany(ctx, indexModels)
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

// GetFleetCollection returns the fleets collection.
func GetFleetCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("fleets")
}

// GetInviteCollection returns the invites collection.
func GetInviteCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("invites")
}

// GetMileageLogCollection returns the mileage_logs collection.
func GetMileageLogCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("mileage_logs")
}

// GetLoadCollection returns the loads collection.
func GetLoadCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("loads")
}

// Disconnect closes the MongoDB connection.
func Disconnect() {
	if err := client.Disconnect(context.Background()); err != nil {
		log.Fatal("Failed to disconnect from MongoDB:", err)
	}
}

// migrationUserDoc is the projection RunMigration reads — only the fields the
// backfill needs. Fetching the full User would pull bcrypt hashes and refresh
// tokens into memory for no reason and slow the startup pass.
type migrationUserDoc struct {
	ID        bson.ObjectID `bson:"_id"`
	FirstName string        `bson:"first_name"`
	Role      string        `bson:"role"`
	FleetID   string        `bson:"fleet_id"`
}

// RunMigration backfills role + fleet_id for legacy users who registered
// before the multi-tenant model existed.
//
// For each user missing a role:
//  1. Create a Fleet owned by that user, named "<FirstName>'s Fleet".
//  2. Set the user's role=owner and fleet_id to the new fleet's hex ID.
//  3. Stamp every truck owned by that user with the new fleet_id.
//  4. Stamp every expense owned by that user with the new fleet_id.
//
// Idempotent: a user with a non-empty role is skipped, and step 3/4 use a
// fleet_id-missing predicate so re-running cannot stomp existing values.
//
// Per-user failures are logged and skipped so one bad row does not block the
// rest of the tenant from logging in. A failure of the wholesale scan itself
// (cursor open / iterate) IS returned, because that means we cannot trust the
// migration ran to completion and refusing to start is safer than silently
// half-migrating.
func RunMigration(ctx context.Context) error {
	users := GetUserCollection()
	fleets := GetFleetCollection()
	trucks := GetTruckCollection()
	expenses := GetExpenseCollection()

	// Backfill email verification for legacy users. Accounts that predate the
	// verification gate have no email_verified field; mark them verified so the
	// new hard gate in Login never locks out an existing user. Idempotent — only
	// documents missing the field are touched, so reruns are no-ops. A failure
	// here is returned (fatal at startup) because letting the gate apply to
	// un-backfilled users would lock real operators out of their accounts.
	verifyRes, err := users.UpdateMany(ctx,
		bson.M{"email_verified": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"email_verified": true}},
	)
	if err != nil {
		log.Printf("RunMigration: email_verified backfill failed: %v", err)
		return err
	}
	if verifyRes.ModifiedCount > 0 {
		log.Printf("RunMigration: backfilled email_verified=true on %d legacy user(s)", verifyRes.ModifiedCount)
	}

	// Predicate: role missing OR empty. Covers both legacy docs (no field)
	// and any partially-written docs that landed with role:"".
	filter := bson.M{
		"$or": []bson.M{
			{"role": bson.M{"$exists": false}},
			{"role": ""},
		},
	}
	projection := bson.M{
		"_id":        1,
		"first_name": 1,
		"role":       1,
		"fleet_id":   1,
	}

	cursor, err := users.Find(ctx, filter, options.Find().SetProjection(projection))
	if err != nil {
		log.Printf("RunMigration: scan failed: %v", err)
		return err
	}
	defer cursor.Close(ctx)

	migrated := 0
	skipped := 0
	for cursor.Next(ctx) {
		var u migrationUserDoc
		if err := cursor.Decode(&u); err != nil {
			log.Printf("RunMigration: decode failed, skipping: %v", err)
			skipped++
			continue
		}

		// Defensive: a doc could have role missing AND fleet_id already set
		// from a prior partial run. Honor that fleet_id rather than minting a
		// duplicate fleet.
		fleetHex := u.FleetID
		if fleetHex == "" {
			fleet := models.Fleet{
				OwnerID:   u.ID.Hex(),
				Name:      u.FirstName + "'s Fleet",
				CreatedAt: time.Now(),
			}
			res, err := fleets.InsertOne(ctx, fleet)
			if err != nil {
				log.Printf("RunMigration: fleet insert failed for user %s: %v", u.ID.Hex(), err)
				skipped++
				continue
			}
			oid, ok := res.InsertedID.(bson.ObjectID)
			if !ok {
				log.Printf("RunMigration: unexpected InsertedID type for user %s", u.ID.Hex())
				skipped++
				continue
			}
			fleetHex = oid.Hex()
		}

		// Stamp the user. Always set role=owner — legacy users are operators
		// by definition; drivers only enter the system via invite acceptance.
		_, err := users.UpdateOne(ctx,
			bson.M{"_id": u.ID},
			bson.M{"$set": bson.M{
				"role":       models.RoleOwner,
				"fleet_id":   fleetHex,
				"updated_at": time.Now(),
			}},
		)
		if err != nil {
			log.Printf("RunMigration: user update failed for %s: %v", u.ID.Hex(), err)
			skipped++
			continue
		}

		// Stamp owned trucks where fleet_id is missing.
		ownerHex := u.ID.Hex()
		truckFilter := bson.M{
			"user_id": ownerHex,
			"$or": []bson.M{
				{"fleet_id": bson.M{"$exists": false}},
				{"fleet_id": ""},
			},
		}
		if _, err := trucks.UpdateMany(ctx, truckFilter, bson.M{"$set": bson.M{"fleet_id": fleetHex}}); err != nil {
			// A truck-stamp failure is bad but not fatal — log and continue.
			// The next migration run will retry these documents because the
			// predicate is idempotent.
			log.Printf("RunMigration: truck stamp failed for user %s: %v", ownerHex, err)
		}

		// Stamp owned expenses where fleet_id is missing.
		expenseFilter := bson.M{
			"user_id": ownerHex,
			"$or": []bson.M{
				{"fleet_id": bson.M{"$exists": false}},
				{"fleet_id": ""},
			},
		}
		if _, err := expenses.UpdateMany(ctx, expenseFilter, bson.M{"$set": bson.M{"fleet_id": fleetHex}}); err != nil {
			log.Printf("RunMigration: expense stamp failed for user %s: %v", ownerHex, err)
		}

		migrated++
	}
	if err := cursor.Err(); err != nil {
		log.Printf("RunMigration: cursor error after iteration: %v", err)
		return err
	}

	if migrated == 0 && skipped == 0 {
		log.Println("RunMigration: no legacy users found, nothing to do")
	} else {
		log.Printf("RunMigration: migrated=%d skipped=%d", migrated, skipped)
	}
	return nil
}
