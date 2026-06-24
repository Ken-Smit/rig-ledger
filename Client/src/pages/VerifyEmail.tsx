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
    <div className="authwrap">
      <div className="authcard">
        <div className="brand">
          <span className="mark">⬡</span>
          <span className="word">
            Rig<span className="cy">Ledger</span>
          </span>
        </div>

        <section className="panel">
          <h1>Email Verification</h1>
          <div className="sub">
            {status === 'verifying'
              ? 'Confirming your email address, one moment.'
              : status === 'success'
                ? 'Your email is confirmed.'
                : 'We could not verify this link.'}
          </div>

          {status === 'error' && <div className="err">{message}</div>}
          {status === 'success' && <div className="ok">{message}</div>}

          {status === 'success' && (
            <div className="foot">
              <Link to="/login">Go to sign in</Link>
            </div>
          )}

          {status === 'error' && (
            <div className="foot">
              <Link to="/login">Back to sign in</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
