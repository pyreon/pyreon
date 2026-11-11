/**
 * Request parsing shared by `/api/signin` and `/api/signup`.
 *
 * Only `application/json` is accepted. A cross-site page can POST a form
 * (`application/x-www-form-urlencoded`) to any origin without asking, but a
 * JSON body needs a CORS preflight this app never grants, so requiring it
 * blocks login CSRF (an attacker signing a victim into the attacker's account).
 */
export async function readCredentials(
  request: Request,
): Promise<{ email: string; password: string } | Response> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    return Response.json({ error: "Expected a JSON body" }, { status: 415 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown }

  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Missing email or password" }, { status: 400 })
  }

  return { email, password }
}
