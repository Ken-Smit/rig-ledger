import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { getSubscription, startCheckout, openBillingPortal, redeemPromo } from '../api/billing'
import { PLAN_TIERS, isEntitled, statusLabel } from '../types/billing'
import type { Subscription } from '../types/billing'

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data
  return data?.error ?? 'Something went wrong. Please try again.'
}

export default function Billing() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [sub, setSub]         = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState('')   // tier key or 'portal' while redirecting
  const [error, setError]     = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoMsg, setPromoMsg]   = useState('')

  // Banner reflecting the Stripe Checkout return (?status=success|cancel).
  const returned = params.get('status')

  useEffect(() => {
    getSubscription()
      .then(setSub)
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) navigate('/login')
        else setError('Failed to load billing')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleSubscribe = async (tier: string) => {
    setError('')
    setBusy(tier)
    try {
      window.location.href = await startCheckout(tier)
    } catch (err) {
      setError(errorMessage(err))
      setBusy('')
    }
  }

  const handlePortal = async () => {
    setError('')
    setBusy('portal')
    try {
      window.location.href = await openBillingPortal()
    } catch (err) {
      setError(errorMessage(err))
      setBusy('')
    }
  }

  const handlePromo = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPromoMsg('')
    setPromoBusy(true)
    try {
      const res = await redeemPromo(promoCode)
      setPromoMsg(res.message)
      setPromoCode('')
      setSub(await getSubscription()) // refresh the truck meter
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPromoBusy(false)
    }
  }

  const entitled = sub ? isEntitled(sub.status) : false

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Account</div>
            <h1>Billing</h1>
            <div className="sub">Pick the plan that fits your fleet. Every plan starts with a 7-day free trial — no charge today, cancel anytime.</div>
          </div>
        </div>

        {returned === 'success' && <div className="done-note" style={{ marginBottom: 18 }}>You’re subscribed — thanks! It may take a moment to reflect below.</div>}
        {returned === 'cancel'  && <div className="done-note" style={{ marginBottom: 18 }}>Checkout canceled — no charge was made.</div>}
        {error && <div className="alert-error" style={{ marginBottom: 18 }}>{error}</div>}

        {loading ? (
          <div className="loading-state"><div className="loading-spinner" /><p>Loading...</p></div>
        ) : (
          <>
            {/* Current plan + usage */}
            <div className="kpis">
              <div className="kpi hero-k">
                <div className="k">Current plan</div>
                <div className="v">{entitled && sub?.tier ? (PLAN_TIERS.find(p => p.key === sub.tier)?.label ?? '—') : '—'}</div>
                <div className={`d ${entitled ? 'up' : ''}`}>{statusLabel(sub?.status ?? '')}</div>
              </div>
              <div className="kpi">
                <div className="k">Trucks used</div>
                <div className="v num">{sub?.truck_count ?? 0} / {sub?.truck_limit ?? 1}</div>
                <div className="d">Units on this plan</div>
              </div>
              <div className="kpi" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <button className="btn ghost" style={{ width: 'auto', margin: 0 }} onClick={handlePortal} disabled={busy !== '' || !sub?.status}>
                  {busy === 'portal' ? 'Opening...' : 'Manage Billing'}
                </button>
              </div>
            </div>

            {/* Promo code */}
            <section className="panel" style={{ marginTop: 6 }}>
              <h2>Promo Code</h2>
              <p className="sub" style={{ marginTop: 0 }}>Have a promo code? Redeem it for bonus truck capacity on your plan.</p>
              {promoMsg && <div className="done-note" style={{ marginBottom: 12 }}>{promoMsg}</div>}
              <form onSubmit={handlePromo} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="field-input"
                  style={{ flex: 1, minWidth: 200 }}
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value)}
                  placeholder="RIG-TRUCK-XXXXXX"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button className="btn primary" style={{ width: 'auto', margin: 0 }} type="submit" disabled={promoBusy || !promoCode.trim()}>
                  {promoBusy ? 'Applying...' : 'Redeem'}
                </button>
              </form>
            </section>

            {/* Plan cards */}
            <div className="home-grid" style={{ marginTop: 6 }}>
              {PLAN_TIERS.map(p => {
                const current = entitled && sub?.tier === p.key
                return (
                  <section key={p.key} className="panel" style={current ? { borderColor: 'var(--accent)' } : undefined}>
                    <p className="kicker">{p.trucks}</p>
                    <h3 style={{ margin: '4px 0 2px', color: 'var(--fg)' }}>{p.label}</h3>
                    <div className="num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--fg)' }}>
                      {p.price}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}> /mo</span>
                    </div>
                    <p className="sub" style={{ minHeight: 40 }}>{p.blurb}</p>
                    <button
                      className={`btn ${current ? 'ghost' : 'primary'}`}
                      style={{ width: '100%', margin: 0 }}
                      onClick={() => handleSubscribe(p.key)}
                      disabled={busy !== '' || current}
                    >
                      {current ? 'Current Plan' : busy === p.key ? 'Redirecting...' : entitled ? 'Switch Plan' : 'Start 7-Day Trial'}
                    </button>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </main>
    </AppShell>
  )
}
