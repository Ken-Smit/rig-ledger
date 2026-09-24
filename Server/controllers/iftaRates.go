package controllers

// IFTA diesel tax rates, sourced from the official IFTA, Inc. quarterly Tax
// Rate Matrix published at https://www.iftach.org (Tax Rate Matrix Downloads).
// Values are the "Special Diesel" column, U.S. units (USD per gallon).
//
// GENERATED, NOT TYPED: these tables were parsed directly from the published
// CSVs. Do not hand-edit a number here — re-run the import against the new
// quarter's CSV so a transcription slip cannot enter a tax calculation.
//
// SCOPE: US member jurisdictions only. Canadian provinces file in CAD/litre
// with different mechanics and are out of scope. Alaska, Hawaii and DC are not
// IFTA members.
//
// MAINTENANCE: a new table MUST be added every quarter. Rates change often —
// ten US jurisdictions changed rate during 2026 alone. A quarter with no table
// returns unpriced lines (see rateUnpublished) rather than computing against a
// stale rate, because a plausible wrong number is worse than a visible blank.
//
// NOT MODELED: Kentucky and Virginia levy a separate per-gallon SURCHARGE on
// top of the base rate (KY $0.105, VA $0.143 through 2026). Rig Ledger does not
// compute surcharge lines, so returns touching those two jurisdictions are
// incomplete — surchargeJurisdictions drives the warning that says so.

// rateQuarter identifies one published quarterly rate table.
type rateQuarter struct {
	Year    int
	Quarter int
}

// iftaDieselRates maps a quarter to that quarter's published per-jurisdiction
// diesel rate. A jurisdiction absent from a loaded quarter (Oregon) publishes
// no IFTA fuel tax rate at all.
var iftaDieselRates = map[rateQuarter]map[string]float64{
	{Year: 2026, Quarter: 1}: {
		"AL": 0.31, "AR": 0.285, "AZ": 0.26, "CA": 0.971, "CO": 0.325,
		"CT": 0.489, "DE": 0.22, "FL": 0.4027, "GA": 0.371, "IA": 0.325,
		"ID": 0.32, "IL": 0.738, "IN": 0.61, "KS": 0.26, "KY": 0.22,
		"LA": 0.2, "MA": 0.24, "MD": 0.4675, "ME": 0.312, "MI": 0.524,
		"MN": 0.326, "MO": 0.295, "MS": 0.21, "MT": 0.2975, "NC": 0.41,
		"ND": 0.23, "NE": 0.318, "NH": 0.222, "NJ": 0.561, "NM": 0.21,
		"NV": 0.27, "NY": 0.3805, "OH": 0.47, "OK": 0.19, "PA": 0.741,
		"RI": 0.4, "SC": 0.28, "SD": 0.28, "TN": 0.27, "TX": 0.2,
		"UT": 0.379, "VA": 0.327, "VT": 0.31, "WA": 0.584, "WI": 0.329,
		"WV": 0.357, "WY": 0.24,
	},
	{Year: 2026, Quarter: 2}: {
		"AL": 0.31, "AR": 0.285, "AZ": 0.26, "CA": 0.971, "CO": 0.325,
		"CT": 0.489, "DE": 0.22, "FL": 0.4097, "GA": 0.373, "IA": 0.325,
		"ID": 0.32, "IL": 0.738, "IN": 0.63, "KS": 0.26, "KY": 0.22,
		"LA": 0.2, "MA": 0.24, "MD": 0.4675, "ME": 0.312, "MI": 0.524,
		"MN": 0.326, "MO": 0.295, "MS": 0.21, "MT": 0.2975, "NC": 0.41,
		"ND": 0.23, "NE": 0.318, "NH": 0.222, "NJ": 0.561, "NM": 0.21,
		"NV": 0.27, "NY": 0.3805, "OH": 0.47, "OK": 0.19, "PA": 0.741,
		"RI": 0.4, "SC": 0.28, "SD": 0.28, "TN": 0.27, "TX": 0.2,
		"UT": 0.379, "VA": 0.327, "VT": 0.31, "WA": 0.584, "WI": 0.329,
		"WV": 0.357, "WY": 0.24,
	},
	{Year: 2026, Quarter: 3}: {
		"AL": 0.31, "AR": 0.285, "AZ": 0.26, "CA": 0.979, "CO": 0.335,
		"CT": 0.499, "DE": 0.22, "FL": 0.4097, "GA": 0.373, "IA": 0.325,
		"ID": 0.32, "IL": 0.738, "IN": 0.63, "KS": 0.26, "KY": 0.22,
		"LA": 0.2, "MA": 0.24, "MD": 0.4745, "ME": 0.312, "MI": 0.524,
		"MN": 0.326, "MO": 0.295, "MS": 0.24, "MT": 0.2975, "NC": 0.41,
		"ND": 0.23, "NE": 0.318, "NH": 0.222, "NJ": 0.561, "NM": 0.21,
		"NV": 0.27, "NY": 0.3805, "OH": 0.47, "OK": 0.19, "PA": 0.741,
		"RI": 0.4, "SC": 0.28, "SD": 0.28, "TN": 0.27, "TX": 0.2,
		"UT": 0.379, "VA": 0.336, "VT": 0.31, "WA": 0.595, "WI": 0.329,
		"WV": 0.357, "WY": 0.24,
	},
}

// iftaJurisdictions is the allowlist of US IFTA member jurisdictions. Kept
// SEPARATE from the rate tables: Oregon is a member you can log miles in, but
// it levies no IFTA fuel tax, so presence here must not imply a rate exists.
var iftaJurisdictions = map[string]bool{
	"AL": true, "AR": true, "AZ": true, "CA": true, "CO": true, "CT": true,
	"DE": true, "FL": true, "GA": true, "IA": true, "ID": true, "IL": true,
	"IN": true, "KS": true, "KY": true, "LA": true, "MA": true, "MD": true,
	"ME": true, "MI": true, "MN": true, "MO": true, "MS": true, "MT": true,
	"NC": true, "ND": true, "NE": true, "NH": true, "NJ": true, "NM": true,
	"NV": true, "NY": true, "OH": true, "OK": true, "OR": true, "PA": true,
	"RI": true, "SC": true, "SD": true, "TN": true, "TX": true, "UT": true,
	"VA": true, "VT": true, "WA": true, "WI": true, "WV": true, "WY": true,
}

// surchargeJurisdictions are members levying a separate surcharge Rig Ledger
// does NOT compute. The value is the published surcharge for reference only;
// its presence drives a user-facing warning that the line is incomplete.
var surchargeJurisdictions = map[string]float64{
	"KY": 0.105,
	"VA": 0.143,
}

// rateStatus explains why a return line does or does not carry a tax rate.
type rateStatus int

const (
	// rateOK: a published rate was found for this jurisdiction and quarter.
	rateOK rateStatus = iota
	// rateNoTax: the jurisdiction is an IFTA member that levies no fuel tax.
	// Oregon taxes heavy vehicles through a weight-mile tax filed separately,
	// so its IFTA line is genuinely $0 — NOT an unknown rate.
	rateNoTax
	// rateUnpublished: no rate table is loaded for that quarter. The line is
	// left unpriced rather than computed against another quarter's numbers.
	rateUnpublished
)

// rateFor returns the diesel rate for a jurisdiction in a specific quarter.
//
// The quarter is REQUIRED: rates change quarterly, so a rate is meaningless
// without the period it belongs to. Callers must treat any status other than
// rateOK as "do not file this line as computed".
func rateFor(jurisdiction string, year, quarter int) (float64, rateStatus) {
	table, ok := iftaDieselRates[rateQuarter{Year: year, Quarter: quarter}]
	if !ok {
		return 0, rateUnpublished
	}
	rate, ok := table[jurisdiction]
	if !ok {
		// In a loaded quarter, absence means the jurisdiction publishes no
		// fuel-tax rate (Oregon), not that the data is missing.
		return 0, rateNoTax
	}
	return rate, rateOK
}

// isIftaJurisdiction reports whether a code is a supported IFTA jurisdiction.
func isIftaJurisdiction(jurisdiction string) bool {
	return iftaJurisdictions[jurisdiction]
}

// iftaRatesSource attributes the figures on screen to their authority, so a
// user (or an auditor) can trace a number back to a published table.
const iftaRatesSource = "IFTA, Inc. quarterly Tax Rate Matrix (iftach.org)"
