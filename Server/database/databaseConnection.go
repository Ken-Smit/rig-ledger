package database

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var client *mongo.Client

// Connect initializes the MongoDB connection
func Connect(mongoURI string) {
	var err error
	opts := options.Client().ApplyURI(mongoURI)
	client, err = mongo.Connect(opts)
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	// Test the connection
	err = client.Ping(context.Background(), nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	log.Println("Connected to MongoDB successfully")
}

// GetUserCollection returns the users collection
func GetUserCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("users")
}

// GetTruckCollection returns the trucks collection
func GetTruckCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("trucks")
}

// GetExpenseCollection returns the expenses collection
func GetExpenseCollection() *mongo.Collection {
	return client.Database("rigledger").Collection("expenses")
}

// Disconnect closes the MongoDB connection
func Disconnect() {
	if err := client.Disconnect(context.Background()); err != nil {
		log.Fatal("Failed to disconnect from MongoDB:", err)
	}
}
