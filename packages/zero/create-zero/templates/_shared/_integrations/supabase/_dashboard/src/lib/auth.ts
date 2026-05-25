import { supabase } from './supabase'

/**
 * Supabase-backed auth implementation. Mirrors the in-memory stub's
 * exported surface (signIn / signUp / getSession / signOut / SessionInfo)
 * so route guards don't change when swapping backends.
 */

export interface SessionInfo {
  userId: string
  email: string
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }
  if (!data.session) return { error: 'Email confirmation required — check your inbox.' }
  return { sessionId: data.session.access_token }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return { sessionId: data.session.access_token }
}

export async function getSession(sessionId: string | undefined): Promise<SessionInfo | null> {
  if (!sessionId) return null
  const { data, error } = await supabase.auth.getUser(sessionId)
  if (error || !data.user) return null
  return { userId: data.user.id, email: data.user.email ?? '' }
}

export async function signOut(sessionId: string): Promise<void> {
  // Supabase tokens are JWTs; revocation is server-mediated. We invalidate
  // the access token by calling `supabase.auth.admin.signOut(sessionId)`
  // when the service-role key is available; otherwise fall back to a
  // client-side cookie clear (handled by the route).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await supabase.auth.admin.signOut(sessionId)
  }
}
