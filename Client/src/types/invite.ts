// Invite shapes returned by the owner-only invites API and the public
// lookup endpoint. Kept minimal and aligned with the backend's JSON tags
// (omitempty fields are optional here).

export interface Invite {
  _id: string
  fleet_id: string
  created_by: string
  email?: string
  expires_at: string
  consumed_at?: string | null
  created_at: string
}

// InviteCreateResponse carries the one-time raw token. It is shown to the
// owner once and never returned again — the server stores only a hash.
export interface InviteCreateResponse {
  invite_id: string
  token: string
  expires_at: string
}

// InviteLookup is the public, unauthenticated peek used by the driver
// registration page to confirm the invite is real before collecting a
// password. fleet_name is non-sensitive; email is echoed back when the
// owner pre-bound the invite to a specific address.
export interface InviteLookup {
  fleet_name: string
  email?: string
}
