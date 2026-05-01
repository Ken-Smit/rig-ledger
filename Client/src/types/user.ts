// AuthUser mirrors the server's models.UserResponse — the projected fields
// that GetUserProfile returns to the client. Sensitive fields (password hash,
// refresh_token, _id) are intentionally never sent over the wire.
export interface AuthUser {
  user_id: string
  first_name: string
  last_name: string
  email: string
  role: Role
  fleet_id: string
}

// Role is a closed set known to the server. Anything else is a malformed
// response and must be treated as anonymous.
export type Role = 'owner' | 'driver'

// String constants are exported so call sites read as `role === ROLE_OWNER`
// rather than sprinkling raw string literals across the codebase. The
// compiler still narrows because the constants are typed by inference.
export const ROLE_OWNER: Role = 'owner'
export const ROLE_DRIVER: Role = 'driver'

// AuthStatus is a small finite-state machine for the session.
//   'loading' — the boot probe to /auth/refresh + /user/profile is in flight.
//   'authed'  — the probe succeeded; `user` is populated.
//   'anon'    — no valid session; routes that require auth must redirect.
export type AuthStatus = 'loading' | 'authed' | 'anon'
