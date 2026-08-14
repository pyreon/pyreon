/**
 * Which names the dev certificate has to cover, and how to find your machine
 * on the network.
 *
 * The LAN half is the reason this plugin is worth having. `http://localhost`
 * is already a secure context, so on your own machine the gated APIs work
 * without any of this. A phone reaches the dev server at
 * `http://192.168.1.24:3000`, which is NOT a secure context — so `useCamera`,
 * `useGeolocation`, `useDeviceMotion`, service workers and the rest are all
 * unavailable exactly where they most need testing.
 */
import { networkInterfaces } from 'node:os'

/** Always covered: the loopback names a browser treats as trustworthy anyway. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'] as const

export interface LanAddress {
  address: string
  /** The OS interface name (`en0`, `wlan0`) — shown so you can tell Wi-Fi from a VPN. */
  iface: string
  family: 'IPv4' | 'IPv6'
}

/**
 * Every non-internal address, best candidate first.
 *
 * Ordering is deliberate rather than cosmetic: the FIRST entry is what gets
 * printed as the URL to open on a phone, and a machine routinely has several
 * (Wi-Fi, Ethernet, Docker bridges, VPN tunnels, virtual adapters). A private
 * IPv4 on a physical-looking interface is what a phone on the same Wi-Fi can
 * actually reach; a Docker bridge address is reachable from nothing.
 */
export function lanAddresses(): LanAddress[] {
  const found: LanAddress[] = []
  for (const [iface, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue
      const family = normalizeFamily(addr.family)
      if (family === null) continue
      // Link-local is never the address someone else reaches you on, in
      // either family. IPv4 169.254/16 means DHCP failed; IPv6 fe80::/10 is
      // not even usable without a zone index, and a machine typically has one
      // per interface — a real laptop produced EIGHT, which is certificate
      // noise at best and makes the SAN list unreadable at worst.
      if (isLinkLocal(addr.address, family)) continue
      found.push({ address: addr.address, iface, family })
    }
  }
  return found.sort((a, b) => score(b) - score(a))
}

/** Node has reported `family` as both `'IPv4'` and `4` across versions. */
function normalizeFamily(family: string | number): 'IPv4' | 'IPv6' | null {
  if (family === 'IPv4' || family === 4) return 'IPv4'
  if (family === 'IPv6' || family === 6) return 'IPv6'
  return null
}

function score(addr: LanAddress): number {
  let n = 0
  // IPv4 first: it is what a phone's browser will use, and typing it is
  // survivable where an IPv6 literal is not.
  if (addr.family === 'IPv4') n += 100
  if (isPrivateV4(addr.address)) n += 50
  // Virtual adapters answer `networkInterfaces()` but route nowhere useful.
  if (/^(docker|br-|veth|virbr|vmnet|utun|tun|tap|ZeroTier|zt)/i.test(addr.iface)) n -= 80
  // Common physical names across macOS/Linux/Windows.
  if (/^(en|eth|wl|wlan|Wi-?Fi|Ethernet)/i.test(addr.iface)) n += 20
  return n
}

/**
 * Link-local in either family: IPv4 `169.254/16`, IPv6 `fe80::/10`.
 *
 * The v6 range is the first ten bits `1111111010`, so the second byte's top
 * two bits must be `10` — that is `fe80` through `febf`, not just `fe80`.
 */
export function isLinkLocal(address: string, family: 'IPv4' | 'IPv6'): boolean {
  if (family === 'IPv4') return address.startsWith('169.254.')
  return /^fe[89ab][0-9a-f]:/i.test(address)
}

export function isPrivateV4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts as [number, number, number, number]
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export interface ResolveHostsOptions {
  /** Extra names — a custom domain like `app.pyreon.test`. */
  hosts?: string[] | undefined
  /** Include this machine's LAN addresses so a real device can connect. */
  lan?: boolean | undefined
}

export interface ResolvedHosts {
  /** Every name to put in the certificate, in SAN order (first becomes the CN). */
  all: string[]
  /** The LAN addresses that were included, if any — used for the printed URL. */
  lan: LanAddress[]
  /** Custom names that need a hosts-file entry to resolve. */
  needsHostsEntry: string[]
}

/**
 * Assemble the certificate's host list.
 *
 * Loopback always comes first so the CN is `localhost` — a certificate whose
 * CN is a LAN IP that changes with your DHCP lease is confusing to read in a
 * browser's certificate viewer.
 */
export function resolveHosts(options: ResolveHostsOptions = {}): ResolvedHosts {
  const custom = (options.hosts ?? []).map((h) => h.trim()).filter((h) => h.length > 0)
  const lan = options.lan === true ? lanAddresses() : []
  return {
    all: [...LOOPBACK_HOSTS, ...custom, ...lan.map((a) => a.address)],
    lan,
    needsHostsEntry: custom.filter(needsHostsFileEntry),
  }
}

/**
 * Does this name need an `/etc/hosts` line to resolve?
 *
 * `*.localhost` resolves to loopback natively in every modern browser and
 * resolver, so it needs nothing. Anything else custom does — `.test` and
 * `.local` included, and `.local` additionally collides with mDNS, which is
 * why the printed guidance prefers `.localhost`.
 */
export function needsHostsFileEntry(host: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false
  if (host.includes(':')) return false // IPv6 literal
  const lower = host.toLowerCase()
  if (lower === 'localhost') return false
  if (lower.endsWith('.localhost')) return false
  return true
}

/**
 * The exact lines to add to the hosts file.
 *
 * PRINTED, never written. Editing `/etc/hosts` needs root, is global to the
 * machine, and is not something a dev-server plugin should do on your behalf —
 * a stale entry left behind by a tool you have since deleted is a genuinely
 * unpleasant thing to debug.
 */
export function hostsFileHint(hosts: string[]): string | null {
  const need = hosts.filter(needsHostsFileEntry)
  if (need.length === 0) return null
  const file = process.platform === 'win32' ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts'
  const lines = need.map((h) => `127.0.0.1  ${h}`).join('\n')
  return `${need.join(', ')} will not resolve until added to ${file}:\n\n${lines}\n\nTip: a *.localhost name (app.localhost) resolves to loopback with no hosts entry at all.`
}
