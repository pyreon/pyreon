/**
 * In-memory auth implementation. Stores users + sessions in module state
 * on the server — every dev-server restart wipes it.
 *
 * The exported surface (`signIn` / `signUp` / `getSession` / `signOut` +
 * `SessionInfo`) is the contract route guards consume; routes never import
 * an underlying provider directly. To replace this file with a real
 * implementation, run:
 *
 *   bunx create-pyreon-app --template dashboard --integrations supabase
 *
 * (or pick Supabase in the interactive prompt) — the scaffolder overwrites
 * this file with a Supabase-backed implementation that keeps the same
 * function signatures, so routes don't need to change.
 */

interface User {
  id: string
  email: string
  password: string // plain text — STUB ONLY; real impl uses argon2id
  createdAt: Date
}

interface Session {
  id: string
  userId: string
  email: string
  expiresAt: Date
}

const users = new Map<string, User>()
const sessions = new Map<string, Session>()

let nextUserId = 1
function newUserId(): string {
  return `u_${nextUserId++}`
}

function newSessionId(): string {
  // Real impl uses crypto.randomUUID + signed cookies
  return `s_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

// Seed a demo user so the login form has something to log in with
users.set("demo@example.com", {
  id: newUserId(),
  email: "demo@example.com",
  password: "demo1234",
  createdAt: new Date(),
})

export interface SessionInfo {
  userId: string
  email: string
}

export function signUp(email: string, password: string): { sessionId: string } | { error: string } {
  if (users.has(email)) return { error: "Email already registered" }
  if (password.length < 8) return { error: "Password must be at least 8 characters" }

  const user: User = {
    id: newUserId(),
    email,
    password,
    createdAt: new Date(),
  }
  users.set(email, user)

  const sid = newSessionId()
  sessions.set(sid, {
    id: sid,
    userId: user.id,
    email,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })
  return { sessionId: sid }
}

export function signIn(email: string, password: string): { sessionId: string } | { error: string } {
  const user = users.get(email)
  if (!user || user.password !== password) return { error: "Invalid email or password" }

  const sid = newSessionId()
  sessions.set(sid, {
    id: sid,
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })
  return { sessionId: sid }
}

export async function getSession(sessionId: string | undefined): Promise<SessionInfo | null> {
  if (!sessionId) return null
  const s = sessions.get(sessionId)
  if (!s) return null
  if (s.expiresAt < new Date()) {
    sessions.delete(sessionId)
    return null
  }
  return { userId: s.userId, email: s.email }
}

export async function signOut(sessionId: string): Promise<void> {
  sessions.delete(sessionId)
}
