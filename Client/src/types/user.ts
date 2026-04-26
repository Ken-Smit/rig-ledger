// AuthUser mirrors the server's models.UserResponse — the projected fields
// that GetUserProfile returns to the client. Sensitive fields (password hash,
// refresh_token, _id) are intentionally never sent over the wire.
export interface AuthUser {
  user_id: string
  first_name: string
  last_name: string
  email: string
}

// AuthStatus is a small finite-state machine for the session.
//   'loading' — the boot probe to /auth/refresh + /user/profile is in flight.
//   'authed'  — the probe succeeded; `user` is populated.
//   'anon'    — no valid session; routes that require auth must redirect.
export type AuthStatus = 'loading' | 'authed' | 'anon'
