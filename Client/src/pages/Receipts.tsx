import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import AddExpenseModal, { type EntryPrefill } from '../components/AddExpenseModal'
import { getTrucks } from '../api/trucks'
import { createExpense } from '../api/expenses'
import { scanReceipt } from '../api/receipts'
import { compressImage } from '../utils/compressImage'
import { labelForType, slugifyCategory } from '../types/expense'
import type { Truck } from '../types/truck'
import type { ExpenseFormData } from '../types/expense'
import type { ScanResult } from '../types/receipt'

// A receipt the user saved this session — drives the "Recent captures" panel.
interface Capture {
  id: string
  vendor: string
  sub: string
  amount: string
}

function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Pull the server's friendly message if present, else a generic fallback.
function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data
  return data?.error ?? 'Couldn’t scan that receipt. Try again or add the entry manually.'
}

export default function Receipts() {
  const navigate = useNavigate()
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError]       = useState('')
  const [prefill, setPrefill]   = useState<EntryPrefill | null>(null)
  const [recent, setRecent]     = useState<Capture[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getTrucks()
      .then(setTrucks)
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) navigate('/login')
      })
  }, [navigate])

  // Map the AI-extracted fields onto the modal's seed shape. Fuel gallons (if
  // any) go into the note so they aren't lost — the expense schema has no
  // gallons field.
  const toPrefill = (scan: ScanResult): EntryPrefill => ({
    direction:   'expense',
    category:    scan.category ? labelForType(slugifyCategory(scan.category)) : '',
    amount:      scan.amount ? String(scan.amount) : '',
    date:        scan.date,
    description: scan.gallons ? `${scan.vendor} · ${scan.gallons} gal`.trim() : scan.vendor,
  })

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    setError('')
    setScanning(true)
    try {
      const compressed = await compressImage(file)
      const scan = await scanReceipt(compressed)
      setPrefill(toPrefill(scan))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setScanning(false)
    }
  }

  const handleSave = async (data: ExpenseFormData) => {
    const exp = await createExpense(data)
    setRecent(prev => [{
      id:     exp._id,
      vendor: exp.description || labelForType(exp.type),
      sub:    `${labelForType(exp.type)}${exp.date ? ` · ${fmtDate(exp.date)}` : ''}`,
      amount: money(exp.amount),
    }, ...prev])
    setPrefill(null)
  }

  const noTrucks = trucks.length === 0

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Receipts</div>
            <h1>Scan a receipt</h1>
            <div className="sub">Snap a fuel or maintenance receipt — the scanner reads the total, date and category.</div>
          </div>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 18 }}>{error}</div>}
        {noTrucks && <div className="done-note" style={{ marginBottom: 18 }}>Add a truck first — every entry is logged against a unit.</div>}

        <div className="grid2">
          <section className="panel">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <button
              type="button"
              className="drop"
              onClick={() => fileRef.current?.click()}
              disabled={scanning || noTrucks}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              <div className="t">{scanning ? 'Reading receipt…' : 'Tap to upload a receipt'}</div>
              <div className="h">JPG, PNG, WEBP or PDF · up to 10 MB</div>
            </button>
          </section>

          <section className="panel">
            <h2>Recent captures</h2>
            {recent.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>Scanned receipts you save will show up here.</p>
            ) : (
              <div className="feed">
                {recent.map(r => (
                  <div className="r" key={r.id}>
                    <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg></div>
                    <div className="v">{r.vendor}<small>{r.sub}</small></div>
                    <div className="amt">{r.amount}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {prefill && !noTrucks && (
        <AddExpenseModal
          trucks={trucks}
          initial={prefill}
          onSave={handleSave}
          onClose={() => setPrefill(null)}
        />
      )}
    </AppShell>
  )
}
