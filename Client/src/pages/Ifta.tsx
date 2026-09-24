import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { getTrucks } from '../api/trucks'
import {
  getIftaReturn, getIftaMiles, getIftaFuel,
  createIftaMiles, createIftaFuel, deleteIftaMiles, deleteIftaFuel,
} from '../api/ifta'
import type { Truck } from '../types/truck'
import type { IftaReturn, IftaMiles, IftaFuel } from '../types/ifta'
import { IFTA_JURISDICTIONS } from '../types/ifta'

const QUARTERS = [1, 2, 3, 4]
const today = () => new Date().toISOString().slice(0, 10)
const num = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const nowYear = new Date().getFullYear()
const nowQuarter = Math.floor(new Date().getMonth() / 3) + 1
const YEARS = [nowYear, nowYear - 1, nowYear - 2]

export default function Ifta() {
  const navigate = useNavigate()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [year, setYear] = useState(nowYear)
  const [quarter, setQuarter] = useState(nowQuarter)

  const [ret, setRet] = useState<IftaReturn | null>(null)
  const [milesList, setMilesList] = useState<IftaMiles[]>([])
  const [fuelList, setFuelList] = useState<IftaFuel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [milesForm, setMilesForm] = useState({ truck_id: '', jurisdiction: 'TX', date: today(), miles: '' })
  const [fuelForm, setFuelForm] = useState({ truck_id: '', jurisdiction: 'TX', date: today(), gallons: '', amount: '' })
  const [savingMiles, setSavingMiles] = useState(false)
  const [savingFuel, setSavingFuel] = useState(false)

  const truckLabel = (id: string) => {
    const t = trucks.find(t => t._id === id)
    return t?.unit_number ?? `UNIT-${id.slice(-4).toUpperCase()}`
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [r, m, f] = await Promise.all([
        getIftaReturn(year, quarter),
        getIftaMiles(year, quarter),
        getIftaFuel(year, quarter),
      ])
      setRet(r); setMilesList(m); setFuelList(f)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) navigate('/login')
      else setError('Failed to load IFTA data')
    } finally {
      setLoading(false)
    }
  }, [year, quarter, navigate])

  useEffect(() => { getTrucks().then(setTrucks).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  // Default the form truck selects once trucks arrive.
  useEffect(() => {
    if (trucks[0]) {
      setMilesForm(f => f.truck_id ? f : { ...f, truck_id: trucks[0]._id })
      setFuelForm(f => f.truck_id ? f : { ...f, truck_id: trucks[0]._id })
    }
  }, [trucks])

  const addMiles = async (e: React.FormEvent) => {
    e.preventDefault()
    const miles = Number(milesForm.miles)
    if (!milesForm.truck_id || !(miles > 0)) { setError('Pick a unit and enter miles greater than zero'); return }
    setSavingMiles(true); setError('')
    try {
      await createIftaMiles({ truck_id: milesForm.truck_id, jurisdiction: milesForm.jurisdiction, date: milesForm.date, miles })
      setMilesForm(f => ({ ...f, miles: '' }))
      await load()
    } catch { setError('Failed to save mileage') } finally { setSavingMiles(false) }
  }

  const addFuel = async (e: React.FormEvent) => {
    e.preventDefault()
    const gallons = Number(fuelForm.gallons)
    const amount = Number(fuelForm.amount || 0)
    if (!fuelForm.truck_id || !(gallons > 0)) { setError('Pick a unit and enter gallons greater than zero'); return }
    setSavingFuel(true); setError('')
    try {
      await createIftaFuel({ truck_id: fuelForm.truck_id, jurisdiction: fuelForm.jurisdiction, date: fuelForm.date, gallons, amount })
      setFuelForm(f => ({ ...f, gallons: '', amount: '' }))
      await load()
    } catch { setError('Failed to save fuel') } finally { setSavingFuel(false) }
  }

  const removeMiles = async (id: string) => {
    if (!confirm('Remove this mileage entry?')) return
    try { await deleteIftaMiles(id); await load() } catch { setError('Failed to remove entry') }
  }
  const removeFuel = async (id: string) => {
    if (!confirm('Remove this fuel entry?')) return
    try { await deleteIftaFuel(id); await load() } catch { setError('Failed to remove entry') }
  }

  const jurisOptions = IFTA_JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)
  const noTrucks = trucks.length === 0

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Fuel tax</div>
            <h1>IFTA — Q{quarter} {year}</h1>
            <div className="sub">Miles and fuel by jurisdiction, computed into your quarterly return.</div>
          </div>
          <div className="headside">
            <div className="tabs">
              {QUARTERS.map(q => (
                <button key={q} type="button" className={quarter === q ? 'on' : ''} onClick={() => setQuarter(q)}>Q{q}</button>
              ))}
            </div>
            <span className="field" style={{ margin: 0 }}>
              <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </span>
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="done-note" style={{ marginBottom: 18 }}>
          Tax rates are a development snapshot — verify against the official IFTA quarterly rates before filing.
        </div>

        {loading ? (
          <div className="loading-state"><div className="loading-spinner" /><p>Loading...</p></div>
        ) : (
          <>
            <div className="top3">
              <div className="c due">
                <div className="k">Net tax {ret && ret.net_tax < 0 ? 'credit' : 'due'}</div>
                <div className="v num">{money(Math.abs(ret?.net_tax ?? 0))}</div>
                <div className="d">across {ret?.lines.length ?? 0} jurisdictions</div>
              </div>
              <div className="c">
                <div className="k">Total miles</div>
                <div className="v num">{num(ret?.total_miles ?? 0)}</div>
                <div className="d">fleet MPG {ret && ret.fleet_mpg > 0 ? ret.fleet_mpg.toFixed(1) : '—'}</div>
              </div>
              <div className="c">
                <div className="k">Total gallons</div>
                <div className="v num">{num(ret?.total_gallons ?? 0)}</div>
                <div className="d">purchased this quarter</div>
              </div>
            </div>

            <section className="panel">
              <h2>By jurisdiction</h2>
              {!ret || ret.lines.length === 0 ? (
                <p className="sub" style={{ margin: 0 }}>No miles or fuel logged for this quarter yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Jurisdiction</th>
                      <th className="r">Miles</th>
                      <th className="r">Taxable gal</th>
                      <th className="r">Purchased gal</th>
                      <th className="r">Rate /gal</th>
                      <th className="r">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ret.lines.map(l => (
                      <tr key={l.jurisdiction}>
                        <td className="st">{l.jurisdiction}{!l.rated && <span className="chip warn" style={{ marginLeft: 8 }}>No rate</span>}</td>
                        <td className="r num">{num(l.miles)}</td>
                        <td className="r num">{l.taxable_gallons.toFixed(1)}</td>
                        <td className="r num">{l.purchased_gallons.toFixed(1)}</td>
                        <td className="r num">{l.rated ? money(l.tax_rate) : '—'}</td>
                        <td className={`r num ${l.net > 0 ? 'down' : l.net < 0 ? 'up' : ''}`}>{money(l.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Net tax {ret.net_tax < 0 ? 'credit' : 'due'}</td>
                      <td className="r" colSpan={4} />
                      <td className={`r num ${ret.net_tax > 0 ? 'down' : 'up'}`}>{money(ret.net_tax)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            {noTrucks ? (
              <section className="panel"><p className="sub" style={{ margin: 0 }}>Add a truck before logging IFTA data.</p></section>
            ) : (
              <div className="grid2">
                {/* Log miles */}
                <section className="panel">
                  <h2>Log miles</h2>
                  <form onSubmit={addMiles}>
                    <div className="two">
                      <div className="field">
                        <label>Unit</label>
                        <select value={milesForm.truck_id} onChange={e => setMilesForm(f => ({ ...f, truck_id: e.target.value }))}>
                          {trucks.map(t => <option key={t._id} value={t._id}>{truckLabel(t._id)}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Jurisdiction</label>
                        <select value={milesForm.jurisdiction} onChange={e => setMilesForm(f => ({ ...f, jurisdiction: e.target.value }))}>{jurisOptions}</select>
                      </div>
                    </div>
                    <div className="two">
                      <div className="field">
                        <label>Date</label>
                        <input type="date" value={milesForm.date} onChange={e => setMilesForm(f => ({ ...f, date: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label>Miles</label>
                        <input className="num" type="number" min={0} step="1" value={milesForm.miles} onChange={e => setMilesForm(f => ({ ...f, miles: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                    <button className="btn primary" type="submit" disabled={savingMiles}>{savingMiles ? 'Saving...' : 'Add miles'}</button>
                  </form>

                  <table style={{ marginTop: 16 }}>
                    <tbody>
                      {milesList.length === 0 ? (
                        <tr><td className="sub">No mileage logged.</td></tr>
                      ) : milesList.map(m => (
                        <tr key={m._id}>
                          <td className="st">{m.jurisdiction}</td>
                          <td>{truckLabel(m.truck_id)}</td>
                          <td className="num">{m.date}</td>
                          <td className="r num">{num(m.miles)}</td>
                          <td className="r"><button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: 12, color: 'var(--neg)' }} onClick={() => removeMiles(m._id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {/* Log fuel */}
                <section className="panel">
                  <h2>Log fuel</h2>
                  <form onSubmit={addFuel}>
                    <div className="two">
                      <div className="field">
                        <label>Unit</label>
                        <select value={fuelForm.truck_id} onChange={e => setFuelForm(f => ({ ...f, truck_id: e.target.value }))}>
                          {trucks.map(t => <option key={t._id} value={t._id}>{truckLabel(t._id)}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Jurisdiction</label>
                        <select value={fuelForm.jurisdiction} onChange={e => setFuelForm(f => ({ ...f, jurisdiction: e.target.value }))}>{jurisOptions}</select>
                      </div>
                    </div>
                    <div className="two">
                      <div className="field">
                        <label>Gallons</label>
                        <input className="num" type="number" min={0} step="0.01" value={fuelForm.gallons} onChange={e => setFuelForm(f => ({ ...f, gallons: e.target.value }))} placeholder="0" />
                      </div>
                      <div className="field">
                        <label>Amount ($)</label>
                        <input className="num" type="number" min={0} step="0.01" value={fuelForm.amount} onChange={e => setFuelForm(f => ({ ...f, amount: e.target.value }))} placeholder="optional" />
                      </div>
                    </div>
                    <div className="field">
                      <label>Date</label>
                      <input type="date" value={fuelForm.date} onChange={e => setFuelForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <button className="btn primary" type="submit" disabled={savingFuel}>{savingFuel ? 'Saving...' : 'Add fuel'}</button>
                  </form>

                  <table style={{ marginTop: 16 }}>
                    <tbody>
                      {fuelList.length === 0 ? (
                        <tr><td className="sub">No fuel logged.</td></tr>
                      ) : fuelList.map(f => (
                        <tr key={f._id}>
                          <td className="st">{f.jurisdiction}</td>
                          <td>{truckLabel(f.truck_id)}</td>
                          <td className="num">{f.date}</td>
                          <td className="r num">{f.gallons.toFixed(1)} gal</td>
                          <td className="r"><button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: 12, color: 'var(--neg)' }} onClick={() => removeFuel(f._id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  )
}
