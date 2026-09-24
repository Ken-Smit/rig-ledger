package controllers

import "testing"

// Spot-check rates against the official IFTA, Inc. matrix. These are the
// jurisdictions that were WRONG in the previous hand-typed table (Colorado was
// off by 39%), plus the ones that changed rate mid-year — exactly the cases a
// stale or mistyped table gets wrong.
func TestRateForMatchesOfficialMatrix(t *testing.T) {
	cases := []struct {
		jur           string
		year, quarter int
		want          float64
	}{
		{"CO", 2026, 3, 0.335},  // was 0.205 — 39% low
		{"MO", 2026, 3, 0.295},  // was 0.220
		{"MS", 2026, 3, 0.240},  // was 0.184
		{"CA", 2026, 3, 0.979},  // was 1.107 — high
		{"IL", 2026, 3, 0.738},  // was 0.604
		{"TN", 2026, 3, 0.270},  // was already correct
		{"CA", 2026, 1, 0.971},  // changed at Q3 — quarter must matter
		{"MS", 2026, 1, 0.210},  // changed at Q3
		{"WA", 2026, 2, 0.584},  // changed at Q3
		{"WA", 2026, 3, 0.595},
	}
	for _, tc := range cases {
		got, status := rateFor(tc.jur, tc.year, tc.quarter)
		if status != rateOK {
			t.Errorf("%s %dQ%d: status %v, want rateOK", tc.jur, tc.year, tc.quarter, status)
			continue
		}
		if got != tc.want {
			t.Errorf("%s %dQ%d: got %.4f, want %.4f", tc.jur, tc.year, tc.quarter, got, tc.want)
		}
	}
}

// Oregon is an IFTA member that levies NO fuel tax (it uses a weight-mile tax).
// Its line is genuinely $0 owed, which must not be confused with an unknown rate.
func TestOregonIsNoTaxNotUnknown(t *testing.T) {
	if !isIftaJurisdiction("OR") {
		t.Fatal("Oregon must remain a valid jurisdiction for logging miles")
	}
	rate, status := rateFor("OR", 2026, 3)
	if status != rateNoTax {
		t.Errorf("status = %v, want rateNoTax", status)
	}
	if rate != 0 {
		t.Errorf("rate = %v, want 0", rate)
	}
}

// A quarter with no loaded table must fail closed — never price a return
// against another quarter's rates.
func TestUnloadedQuarterIsUnpublished(t *testing.T) {
	for _, tc := range []struct{ year, quarter int }{
		{2027, 1}, {2025, 4}, {2026, 4},
	} {
		if _, status := rateFor("TX", tc.year, tc.quarter); status != rateUnpublished {
			t.Errorf("%dQ%d: status %v, want rateUnpublished", tc.year, tc.quarter, status)
		}
	}
}

// Every loaded quarter must cover every member jurisdiction except Oregon, so a
// return can never silently omit a state the driver actually drove through.
func TestEveryQuarterCoversEveryJurisdiction(t *testing.T) {
	for q, table := range iftaDieselRates {
		for jur := range iftaJurisdictions {
			if jur == "OR" {
				continue // levies no fuel tax; intentionally absent
			}
			if _, ok := table[jur]; !ok {
				t.Errorf("%dQ%d missing rate for %s", q.Year, q.Quarter, jur)
			}
		}
	}
}

// Rates must be plausible. A decimal slip (0.0335 or 3.35 for Colorado's
// 0.335) is the failure this catches.
func TestRatesWithinPlausibleRange(t *testing.T) {
	for q, table := range iftaDieselRates {
		for jur, rate := range table {
			if rate < 0.15 || rate > 1.10 {
				t.Errorf("%dQ%d %s = %.4f is outside the plausible $0.15–$1.10 range", q.Year, q.Quarter, jur, rate)
			}
		}
	}
}
