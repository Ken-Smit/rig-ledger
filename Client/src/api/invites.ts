import client from './client'
import type { Invite, InviteCreateResponse, InviteLookup } from '../types/invite'

// listInvites returns every invite created by the current owner. The server
// scopes the result to the JWT subject's fleet, so no fleet_id needs to
// travel on the wire.
export const listInvites = async (): Promise<Invite[]> => {
  const res = await client.get<Invite[] | null>('/api/v1/invites')
  return res.data ?? []
}

// createInvite produces a one-time token. The plain token is returned in
// the body and never again — the server stores only its hash.
export const createInvite = async (
  email?: string,
): Promise<InviteCreateResponse> => {
  const body = email ? { email } : {}
  const res = await client.post<InviteCreateResponse>('/api/v1/invites', body)
  return res.data
}

export const deleteInvite = async (id: string): Promise<void> => {
  await client.delete(`/api/v1/invites/${id}`)
}

// lookupInvite is unauthenticated. The shared client interceptor only acts
// on 401 from non-auth endpoints, so a 404 here surfaces as a normal
// rejected promise — exactly what the driver registration page expects.
export const lookupInvite = async (token: string): Promise<InviteLookup> => {
  const res = await client.get<InviteLookup>('/api/v1/invites/lookup', {
    params: { token },
  })
  return res.data
}
