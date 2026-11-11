/**
 * Browser side of sign-in / sign-up: POST the credentials as JSON to the
 * server endpoint, which sets the HttpOnly session cookie. Resolves to an
 * error message, or `null` on success.
 */
export async function postCredentials(
  url: string,
  email: string,
  password: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) return null
    const body = (await res.json().catch(() => ({}))) as { error?: string }

    return body.error ?? "Request failed"
  } catch {
    return "Network error — please try again"
  }
}
