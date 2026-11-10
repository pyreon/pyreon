/**
 * In-memory auth implementation. SERVER-ONLY: it is called from the
 * `/api/signin`, `/api/signup`, `/api/session` and `/api/signout` routes,
 * never from a page, so neither the user table nor a session id ever reaches
 * the browser. Users and sessions live in module state — every server restart
 * wipes them, and several server instances do not share them.
 *
 * It is a STARTING POINT, not an auth system: no rate limiting, no email
 * verification, no password reset, no persistence. What it does get right, so
 * nothing here has to be unlearned later:
 *   - passwords are stored as salted PBKDF2-SHA256 hashes (Web Crypto), never
 *     in plain text, and compared in constant time;
 *   - session ids are 256 bits from `crypto.getRandomValues`;
 *   - the session cookie is set by the server, `HttpOnly; SameSite=Lax`, and
 *     `Secure` everywhere except plain-HTTP localhost (`session-cookie.ts`).
 *
 * The exported surface (`signIn` / `signUp` / `getSession` / `signOut` +
 * `SessionInfo`) is the contract the API routes consume; nothing imports an
 * underlying provider directly. To replace this file with a real
 * implementation, run:
 *
 *   bunx create-pyreon-app --template dashboard --integrations supabase
 *
 * (or pick Supabase in the interactive prompt) — the scaffolder overwrites
 * this file with a Supabase-backed implementation that keeps the same
 * function signatures, so routes don't need to change.
 */
import { SESSION_TTL_SECONDS } from "./session-cookie"

interface User {
  id: string
  email: string
  /** PBKDF2 salt + derived key, hex. The password itself is never stored. */
  salt: string
  hash: string
  createdAt: Date
}

interface Session {
  id: string
  userId: string
  email: string
  expiresAt: Date
}

export interface SessionInfo {
  userId: string
  email: string
}


// OWASP's current floor for PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS = 600_000

const users = new Map<string, User>()
const sessions = new Map<string, Session>()

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function derive(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (h) => Number.parseInt(h, 16))
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Constant-time string comparison (same-length hex digests). */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function createUser(email: string, password: string): Promise<User> {
  const salt = randomHex(16)
  const user: User = {
    id: `u_${randomHex(8)}`,
    email,
    salt,
    hash: await derive(password, salt),
    createdAt: new Date(),
  }
  users.set(email, user)
  return user
}

function createSession(user: User): string {
  // Drop expired sessions on the way in, so the map is bounded by the sessions
  // live within one TTL rather than by every sign-in since the server started.
  const now = new Date()
  for (const [sid, s] of sessions) if (s.expiresAt < now) sessions.delete(sid)
  const id = randomHex(32)
  sessions.set(id, {
    id,
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  })
  return id
}

// ─── DEMO ACCOUNT — DEVELOPMENT ONLY ─────────────────────────────────────────
// `demo@example.com` / `demo1234` exists ONLY under `vite dev`
// (`import.meta.env.DEV`). A production build compiles this branch away, so a
// deployed app has no account with a password printed in its own source.
// Do not remove the guard: a known login on a public deployment is an open door.
let demoSeeded: Promise<unknown> | null = null
function ensureDemoUser(): Promise<unknown> {
  if (!import.meta.env.DEV) return Promise.resolve()
  demoSeeded ??= createUser("demo@example.com", "demo1234")
  return demoSeeded
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  await ensureDemoUser()
  if (users.has(email)) return { error: "Email already registered" }
  if (password.length < 8) return { error: "Password must be at least 8 characters" }
  return { sessionId: createSession(await createUser(email, password)) }
}

// Hashed against when the email is unknown, so a miss costs the same time as
// a wrong password and response timing does not reveal which emails exist.
const DUMMY_SALT = randomHex(16)

export async function signIn(
  email: string,
  password: string,
): Promise<{ sessionId: string } | { error: string }> {
  await ensureDemoUser()
  const user = users.get(email)
  const hash = await derive(password, user?.salt ?? DUMMY_SALT)
  if (!user || !equal(hash, user.hash)) return { error: "Invalid email or password" }
  return { sessionId: createSession(user) }
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
