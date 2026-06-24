import client from './client'
import type { Subscription } from '../types/billing'

// Current fleet subscription state (status, tier, truck usage).
export const getSubscription = async (): Promise<Subscription> => {
  const res = await client.get('/api/v1/billing/subscription')
  return res.data
}

// Start a Stripe Checkout subscription for a tier. Returns the hosted Checkout
// URL — the caller redirects the browser to it.
export const startCheckout = async (tier: string): Promise<string> => {
  const res = await client.post('/api/v1/billing/checkout', { tier })
  return res.data.url
}

// Open the Stripe Customer Portal for plan changes / cancellation. Returns the
// hosted portal URL.
export const openBillingPortal = async (): Promise<string> => {
  const res = await client.post('/api/v1/billing/portal', {})
  return res.data.url
}

// Redeem a promo code (e.g. "1 free truck"). Returns the confirmation message
// and the fleet's new truck limit.
export const redeemPromo = async (code: string): Promise<{ message: string; truck_limit: number }> => {
  const res = await client.post('/api/v1/billing/promo', { code })
  return res.data
}
