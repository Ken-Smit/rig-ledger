import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrucks, createTruck, deleteTruck, updateTruck } from '../api/trucks'
import { logout } from '../api/auth'
import type { Truck, TruckFormData } from '../types/truck'
import Navbar from '../components/Navbar'
import TruckCard from '../components/TruckCard'
import AddTruckModal from '../components/AddTruckModal'
import EditTruckModal from '../components/EditTruckModal'

export default function Fleet() {
  const navigate = useNavigate()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)

  const fetchTrucks = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getTrucks()
      setTrucks(data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        localStorage.removeItem('logged_in')
        navigate('/login')
      } else {
        setError('FAILED TO LOAD FLEET DATA')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTrucks() }, [])

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('logged_in')
    navigate('/login')
  }

  const handleAddSave = async (data: TruckFormData) => {
    const truck = await createTruck(data)
    setTrucks(prev => [...prev, truck])
  }

  const handleEditSave = async (id: string, data: Partial<TruckFormData>) => {
    await updateTruck(id, data)
    setTrucks(prev => prev.map(t => t._id === id ? { ...t, ...data } : t))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('CONFIRM UNIT REMOVAL?')) return
    try {
      await deleteTruck(id)
      setTrucks(prev => prev.filter(t => t._id !== id))
    } catch {
      setError('FAILED TO REMOVE UNIT')
    }
  }

  return (
    <>
      <div className="dashboard-page">
        <Navbar onLogout={handleLogout} />

        <main className="dashboard-main">
          <div className="fleet-header">
            <div>
              <h2 className="section-title">FLEET REGISTRY</h2>
              <p className="section-sub">
                {trucks.length} unit{trucks.length !== 1 ? 's' : ''} on record
              </p>
            </div>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              + ADD UNIT
            </button>
          </div>

          {error && <div className="alert-error">{error}</div>}

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>SCANNING FLEET DATABASE...</p>
            </div>
          ) : trucks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <p>NO UNITS REGISTERED</p>
              <p className="text-dim">Deploy your first unit to begin tracking</p>
            </div>
          ) : (
            <div className="truck-grid">
              {trucks.map(truck => (
                <TruckCard
                  key={truck._id}
                  truck={truck}
                  onEdit={() => setEditingTruck(truck)}
                  onDelete={() => handleDelete(truck._id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showAddModal && (
        <AddTruckModal
          onSave={handleAddSave}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingTruck && (
        <EditTruckModal
          truck={editingTruck}
          onSave={handleEditSave}
          onClose={() => setEditingTruck(null)}
        />
      )}
    </>
  )
}
