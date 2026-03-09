import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TruckDetail from './pages/TruckDetail'
import Fleet from './pages/Fleet'
import Expenses from './pages/Expenses'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('logged_in') ? <>{children}</> : <Navigate to="/home" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/fleet" element={<PrivateRoute><Fleet /></PrivateRoute>} />
        <Route path="/expenses" element={<PrivateRoute><Expenses /></PrivateRoute>} />
        <Route path="/trucks/:id" element={<PrivateRoute><TruckDetail /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
