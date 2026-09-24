// Fields extracted from a scanned receipt by the backend (Gemini vision).
// This is NOT a persisted record — it seeds the Add Entry modal, where the
// user confirms or corrects every value before it is saved as an expense.
export interface ScanResult {
  amount: number
  date: string
  category: string
  vendor: string
  gallons?: number
  // Two-letter IFTA state, or absent when the receipt didn't yield a valid one.
  // The server validates against its rate table, so any value here is fileable.
  jurisdiction?: string
}
