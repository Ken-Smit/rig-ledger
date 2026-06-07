import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../api/auth'

type Status = 'verifying' | 'success' | 'error'

// VerifyEmail consumes the token from the emailed verification link on mount and
// reports the outcome. It is a public route — the user has no session yet.
export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')

  // Guard against double-invocation in React 18 StrictMode dev, which would
  // fire the one-time verification twice and surface a spurious "expired" error
  // on the second (already-consumed) call.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    if (!token) {
      setStatus('error')
      setMessage('This verification link is invalid or has expired.')
      return
    }

    verifyEmail(token)
      .then((res) => {
        setStatus('success')
        setMessage(res.message)
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error
        setStatus('error')
        setMessage(msg ?? 'This verification link is invalid or has expired.')
      })
  }, [token])

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-bracket-tl" />
        <div className="login-bracket-br" />

        <div className="login-header">
          <div className="login-logo-mark">⬡</div>
          <h1 className="login-logo-title">Rig Ledger</h1>
          <p className="login-logo-sub">Email Verification</p>
        </div>

        {status === 'verifying' && (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <>
            <p style={{ textAlign: 'center' }}>{message}</p>
            <Link to="/login" className="btn-primary login-submit">
              Go to Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="login-error">{message}</div>
            <Link to="/login" className="btn-ghost login-submit">
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
