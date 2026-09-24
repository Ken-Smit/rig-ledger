package controllers

// iftaDieselRates is the per-jurisdiction IFTA diesel surcharge/tax rate in
// USD per gallon. Presence in this map ALSO serves as the jurisdiction
// allowlist — an entry whose code is not a key is rejected at validation
// (allowlist over denylist, per CLAUDE.md).
//
// SCOPE: US contiguous member jurisdictions only. Alaska, Hawaii, and DC are
// not IFTA members. Canadian provinces (AB, BC, ON, …) file in CAD/litre with
// separate rate mechanics and are intentionally out of scope for this v1.
//
// TODO(rates): these are a STATIC SNAPSHOT for development and MUST NOT be used
// for an actual filing without refresh. Real rates change every quarter and are
// published by IFTA, Inc. Production should key rates by (year, quarter) and
// load them from an authoritative source rather than this literal.
var iftaDieselRates = map[string]float64{
	"AL": 0.290, "AR": 0.285, "AZ": 0.260, "CA": 1.107, "CO": 0.205,
	"CT": 0.492, "DE": 0.220, "FL": 0.367, "GA": 0.326, "IA": 0.325,
	"ID": 0.320, "IL": 0.604, "IN": 0.570, "KS": 0.260, "KY": 0.246,
	"LA": 0.200, "MA": 0.240, "MD": 0.4470, "ME": 0.312, "MI": 0.486,
	"MN": 0.285, "MO": 0.220, "MS": 0.184, "MT": 0.2975, "NC": 0.405,
	"ND": 0.230, "NE": 0.248, "NH": 0.222, "NJ": 0.494, "NM": 0.229,
	"NV": 0.270, "NY": 0.4145, "OH": 0.470, "OK": 0.190, "OR": 0.000,
	"PA": 0.785, "RI": 0.370, "SC": 0.280, "SD": 0.300, "TN": 0.270,
	"TX": 0.200, "UT": 0.365, "VA": 0.3020, "VT": 0.320, "WA": 0.494,
	"WI": 0.329, "WV": 0.372, "WY": 0.240,
}

// rateFor returns the diesel tax rate for a jurisdiction and whether one is
// published. A false `rated` means the line is computed but unpriced (rates
// resolve to 0) and must not be filed as-is.
func rateFor(jurisdiction string) (rate float64, rated bool) {
	rate, ok := iftaDieselRates[jurisdiction]
	return rate, ok
}

// isIftaJurisdiction reports whether a code is a supported IFTA jurisdiction.
func isIftaJurisdiction(jurisdiction string) bool {
	_, ok := iftaDieselRates[jurisdiction]
	return ok
}
