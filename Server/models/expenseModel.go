package models

import "go.mongodb.org/mongo-driver/v2/bson"

// ExpenseType represents the category of an expense entry
type ExpenseType string

const (
	ExpenseFuel        ExpenseType = "fuel"
	ExpenseMaintenance ExpenseType = "maintenance"
	ExpenseIncome      ExpenseType = "income"
)

type Expense struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserID      string        `bson:"user_id,omitempty" json:"user_id,omitempty"`
	TruckID     string        `bson:"truck_id" json:"truck_id"`
	Type        ExpenseType   `bson:"type" json:"type"` // "fuel" | "maintenance" | "income"
	Amount      float64       `bson:"amount" json:"amount"`
	Date        string        `bson:"date" json:"date"`
	Description string        `bson:"description,omitempty" json:"description,omitempty"`
}
