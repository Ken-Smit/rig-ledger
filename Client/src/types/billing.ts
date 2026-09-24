// Subscription state for the caller's fleet, as returned by
// GET /api/v1/billing/subscription. status is the raw Stripe status (or "" when
// the fleet has never subscribed). truck_limit / truck_count drive the usage
// meter on the billing page.
export interface Subscription {
  status: string // "" | active | trialing | past_due | canceled
  tier: string // billing tier key, "" when none
  truck_limit: number
  truck_count: number
}

// PlanTier is display metadata for the pricing cards. The `key` must match the
// server's billingTier.Key; everything else is presentational.
export interface PlanTier {
  key: string
  label: string
  price: string
  trucks: string
  blurb: string
}

export const PLAN_TIERS: PlanTier[] = [
  { key: 'owner_op',    label: 'Owner-Operator', price: '$19',  trucks: '1–2 trucks',   blurb: 'For a solo operator running a truck or two.' },
  { key: 'small_fleet', label: 'Small Fleet',    price: '$39',  trucks: '3–7 trucks',   blurb: 'Growing operation with a handful of units.' },
  { key: 'fleet',       label: 'Fleet',          price: '$89',  trucks: '8–20 trucks',  blurb: 'Established fleet, unlimited receipt scans.' },
  { key: 'fleet_plus',  label: 'Fleet+',         price: '$149', trucks: '21–50 trucks', blurb: 'Large fleet with everything unlocked.' },
]

// A fleet is entitled (has access) when Stripe reports an active or trialing
// subscription. past_due / canceled / "" are not entitled.
export function isEntitled(status: string): boolean {
  return status === 'active' || status === 'trialing'
}

// Human-readable plan status for the billing page.
export function statusLabel(status: string): string {
  switch (status) {
    case 'active':   return 'Active'
    case 'trialing': return 'Trial'
    case 'past_due': return 'Payment past due'
    case 'canceled': return 'Canceled'
    default:         return 'No active plan'
  }
}
