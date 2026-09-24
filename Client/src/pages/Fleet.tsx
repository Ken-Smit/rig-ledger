import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getTrucks, createTruck, deleteTruck, updateTruck } from '../api/trucks'
import type { Truck, TruckFormData } from '../types/truck'
import { AppShell } from '../components/AppShell'
import AddTruckModal from '../components/AddTruckModal'
import EditTruckModal from '../components/EditTruckModal'
import { MileageLogModal } from '../components/MileageLogModal'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_OWNER } from '../types/user'

function unitLabelFor(t: Truck): string {
  return t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
}

// Real maintenance rows from the truck's recorded dates. No miles-based status
// guess (we have no live odometer feed), so the dot stays neutral — honest
// over decorative.
function maintRows(t: Truck): { label: string; value: string }[] {
  return [
    { label: 'Oil change', value: t.last_oil_change_date || '—' },
    { label: 'Annual inspection', value: t.annual_inspection_date || '—' },
  ]
}

export default function Fleet() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOwner = user?.role === ROLE_OWNER

  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [mileageTruck, setMileageTruck] = useState<Truck | null>(null)

  const fetchTrucks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getTrucks()
      setTrucks(data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        navigate('/login')
      } else {
        setError('Failed to load fleet data')
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { fetchTrucks() }, [fetchTrucks])

  const handleAddSave = async (data: TruckFormData) => {
    const truck = await createTruck(data)
    setTrucks(prev => [...prev, truck])
  }

  const handleEditSave = async (id: string, data: Partial<TruckFormData>) => {
    await updateTruck(id, data)
    setTrucks(prev => prev.map(t => t._id === id ? { ...t, ...data } : t))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this unit?')) return
    try {
      await deleteTruck(id)
      setTrucks(prev => prev.filter(t => t._id !== id))
    } catch {
      setError('Failed to remove unit')
    }
  }

  const makes = new Set(trucks.map(t => t.make).filter(Boolean)).size
  const withVin = trucks.filter(t => t.vin).length

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Fleet</div>
            <h1>Your trucks</h1>
            <div className="sub owner-only">Every truck on record, tracked by real miles — not the calendar.</div>
            <div className="sub op-only">Your truck and the fleet around it — maintenance tracked by real miles.</div>
          </div>
          {isOwner && (
            <button className="addbtn" type="button" onClick={() => setShowAddModal(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>Add truck
            </button>
          )}
        </div>

        <div className="strip">
          <div className="c"><div className="k">Units on record</div><div className="v num">{trucks.length}</div></div>
          <div className="c"><div className="k">Makes</div><div className="v num">{makes}</div></div>
          <div className="c"><div className="k">VIN on file</div><div className="v num">{withVin}</div></div>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : trucks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⬡</div>
            <p>No units yet</p>
            <p className="text-dim">
              {isOwner ? 'Add your first unit to begin tracking' : 'Your fleet owner hasn\'t added any units yet'}
            </p>
          </div>
        ) : (
          <div className="roster">
            {trucks.map(t => (
              <div
                className="truck"
                key={t._id}
                onClick={() => navigate(`/trucks/${t._id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/trucks/${t._id}`) }}
                style={{ cursor: 'pointer' }}
              >
                <div className="top">
                  <div className="unit">{unitLabelFor(t)}<small>{t.year} {t.make} {t.model}{t.vin ? ` · ${t.vin}` : ''}</small></div>
                </div>
                <div className="tmetrics">
                  <div className="m"><div className="k">Year</div><div className="v">{t.year || '—'}</div></div>
                  <div className="m"><div className="k">Tires</div><div className="v">{t.number_of_tires ?? '—'}</div></div>
                  <div className="m"><div className="k">Oil @ mi</div><div className="v">{t.last_oil_change_mileage != null ? t.last_oil_change_mileage.toLocaleString() : '—'}</div></div>
                </div>
                <div>
                  {maintRows(t).map(m => (
                    <div className="maint-row" key={m.label}>
                      <span className="dot ok" />
                      <span className="lbl">{m.label}</span>
                      <span className="mi">{m.value}</span>
                    </div>
                  ))}
                </div>
                <div className="foot">
                  {isOwner ? (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12.5 }}
                        onClick={e => { e.stopPropagation(); setEditingTruck(t) }}>Edit</button>
                      <button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12.5 }}
                        onClick={e => { e.stopPropagation(); setMileageTruck(t) }}>Miles</button>
                      <button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12.5, color: 'var(--neg)' }}
                        onClick={e => { e.stopPropagation(); handleDelete(t._id) }}>Remove</button>
                    </span>
                  ) : (
                    <button className="btn ghost" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12.5 }}
                      onClick={e => { e.stopPropagation(); setMileageTruck(t) }}>Log miles</button>
                  )}
                  <Link className="view" to={`/trucks/${t._id}`} onClick={e => e.stopPropagation()}>View truck →</Link>
                </div>
              </div>
            ))}

            {isOwner && (
              <button className="addcard" type="button" onClick={() => setShowAddModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 5v14M5 12h14" /></svg>
                <div className="t">Add another truck</div>
                <div style={{ fontSize: 12.5 }}>Set up in minutes — VIN, plate, current odometer.</div>
              </button>
            )}
          </div>
        )}
      </main>

      {isOwner && showAddModal && (
        <AddTruckModal onSave={handleAddSave} onClose={() => setShowAddModal(false)} />
      )}

      {isOwner && editingTruck && (
        <EditTruckModal truck={editingTruck} onSave={handleEditSave} onClose={() => setEditingTruck(null)} />
      )}

      {mileageTruck && (
        <MileageLogModal
          truckId={mileageTruck._id}
          truckLabel={unitLabelFor(mileageTruck)}
          isOpen={true}
          onClose={() => setMileageTruck(null)}
          onSaved={() => setMileageTruck(null)}
        />
      )}
    </AppShell>
  )
}
