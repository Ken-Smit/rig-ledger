package controllers

import "testing"

// The scanner reads whichever part carries the answer. Gemini 3.x can put a
// reasoning part first, and a truncated reply can carry no answer at all.
func TestFirstTextPart(t *testing.T) {
	cases := []struct {
		name  string
		parts []geminiResponsePart
		want  string
	}{
		{"plain answer", []geminiResponsePart{{Text: `{"amount":1}`}}, `{"amount":1}`},
		{"thought first", []geminiResponsePart{{Text: "let me look", Thought: true}, {Text: `{"amount":1}`}}, `{"amount":1}`},
		{"blank skipped", []geminiResponsePart{{Text: "  "}, {Text: `{"amount":1}`}}, `{"amount":1}`},
		{"no usable text", []geminiResponsePart{{Text: "thinking", Thought: true}}, ""},
		{"empty", nil, ""},
	}
	for _, tc := range cases {
		if got := firstTextPart(tc.parts); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

// A tax-relevant field: anything the IFTA rate table doesn't cover must come
// back blank so the driver picks it, never as a fileable guess.
func TestNormalizeJurisdiction(t *testing.T) {
	cases := map[string]string{
		"TN":   "TN", // as returned by the model
		" tn ": "TN", // lowercase + whitespace
		"ON":   "",   // Canadian province, not in the US rate table
		"XX":   "",   // invented code
		"":     "",   // receipt address unreadable
		"TENN": "",   // not a two-letter code
	}
	for in, want := range cases {
		if got := normalizeJurisdiction(in); got != want {
			t.Errorf("normalizeJurisdiction(%q) = %q, want %q", in, got, want)
		}
	}
}
