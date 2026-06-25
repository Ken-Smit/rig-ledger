package models

// CurrentTermsVersion is the server's single source of truth for the Terms of
// Service version a registrant is consenting to at signup.
//
// SECURITY: The client never supplies the version. At registration the server
// stamps this constant onto the user record together with a server-side
// timestamp, producing tamper-proof proof of consent for legal enforceability.
// Bump this string (date-based, YYYY-MM-DD) whenever the Terms of Service text
// changes so re-consent flows can detect users on a stale version.
const CurrentTermsVersion = "2026-06-24"
