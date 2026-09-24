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

// Surcharge rates must match the official matrix. An outdated figure is the
// exact failure here: older IFTA documentation still cites KY at 2.0 cents and
// VA at 6.5 cents, which have not been the diesel rates for years.
func TestSurchargeRatesMatchOfficialMatrix(t *testing.T) {
	for _, q := range []int{1, 2, 3} {
		if rate, ok := surchargeFor("KY", 2026, q); !ok || rate != 0.105 {
			t.Errorf("KY 2026Q%d surcharge = %.4f (ok=%v), want 0.1050", q, rate, ok)
		}
		if rate, ok := surchargeFor("VA", 2026, q); !ok || rate != 0.143 {
			t.Errorf("VA 2026Q%d surcharge = %.4f (ok=%v), want 0.1430", q, rate, ok)
		}
	}
}

// Only KY and VA levy a diesel surcharge in 2026. Indiana's is published as
// "$-" (folded into its base rate), so it must NOT produce a surcharge line —
// that would double-charge every Indiana mile.
func TestOnlyKentuckyAndVirginiaHaveSurcharges(t *testing.T) {
	for q, table := range iftaDieselSurcharges {
		for jur := range table {
			if jur != "KY" && jur != "VA" {
				t.Errorf("%dQ%d has an unexpected surcharge for %s", q.Year, q.Quarter, jur)
			}
		}
	}
	if _, ok := surchargeFor("IN", 2026, 3); ok {
		t.Error("Indiana must not carry a 2026 surcharge — it is folded into the base rate")
	}
	for _, jur := range []string{"TX", "CA", "OR", "TN"} {
		if _, ok := surchargeFor(jur, 2026, 3); ok {
			t.Errorf("%s must not carry a surcharge", jur)
		}
	}
}

// A quarter with no loaded table must report no surcharge rather than falling
// back to another quarter's figure.
func TestSurchargeUnloadedQuarter(t *testing.T) {
	if _, ok := surchargeFor("KY", 2027, 1); ok {
		t.Error("unloaded quarter must not return a surcharge")
	}
}
