import { signOut } from "../../lib/auth"

export function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? ""
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookie)?.[1]
  if (sid) signOut(sid)

  return new Response(null, {
    status: 302,
    headers: {
      "set-cookie": "sid=; path=/; max-age=0",
      location: "/",
    },
  })
}
