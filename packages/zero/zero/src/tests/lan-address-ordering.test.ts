/**
 * Which LAN address `https({ lan: true })` picks, and why the order is not
 * cosmetic.
 *
 * The FIRST entry is what gets certified and printed as the URL to open on
 * a phone. A development machine routinely has several non-internal
 * addresses — Wi-Fi, Ethernet, a Docker bridge, a VPN tunnel, a VM
 * adapter — and only some of them are reachable from another device on
 * the same network.
 *
 * Getting this wrong does not error. The dev server starts, the cert is
 * issued, the URL is printed, and the phone times out — for an address
 * (`172.17.0.1` on `docker0`, say) that routes nowhere outside the host.
 * That is the whole feature failing in the one way its own docs say it
 * must not: *"a cert for an unbound address is unreachable"*.
 *
 * Link-local exclusion is the other half. IPv4 `169.254/16` means DHCP
 * failed; IPv6 `fe80::/10` is unusable without a zone index and a machine
 * has one PER INTERFACE — the source notes a real laptop produced eight,
 * which is certificate noise that makes the SAN list unreadable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

type Iface = { address: string; family: string | number; internal: boolean }

/** Install a synthetic `networkInterfaces()` and re-import the module. */
async function withInterfaces(
  map: Record<string, Iface[]>,
): Promise<typeof import('../https/hosts')> {
  vi.doMock('node:os', async (orig) => {
    const actual = (await orig()) as Record<string, unknown>
    return { ...actual, networkInterfaces: () => map }
  })
  vi.resetModules()
  return import('../https/hosts')
}

afterEach(() => {
  vi.doUnmock('node:os')
  vi.resetModules()
  vi.restoreAllMocks()
})

const v4 = (address: string): Iface => ({ address, family: 'IPv4', internal: false })
const v6 = (address: string): Iface => ({ address, family: 'IPv6', internal: false })

describe('the best candidate is the one a phone can actually reach', () => {
  it('prefers a private IPv4 on a physical interface over a Docker bridge', () => {
    // The headline case. `docker0` answers `networkInterfaces()` exactly
    // like `en0` does, and its address routes nowhere outside the host —
    // so certifying it produces a URL that simply times out.
    return withInterfaces({
      docker0: [v4('172.17.0.1')],
      en0: [v4('192.168.1.24')],
    }).then(({ lanAddresses }) => {
      expect(lanAddresses()[0]?.address).toBe('192.168.1.24')
    })
  })

  it('deprioritises every virtual-adapter prefix, not just docker', async () => {
    // One prefix covered and the rest not is the shape where a VPN user
    // gets a `utun` address and nobody else can reproduce it.
    for (const iface of ['docker0', 'br-abc123', 'veth1', 'virbr0', 'vmnet1', 'utun3', 'tun0', 'tap0', 'ZeroTier-x', 'zt0']) {
      const { lanAddresses } = await withInterfaces({
        [iface]: [v4('10.9.9.9')],
        en0: [v4('192.168.1.24')],
      })
      expect(lanAddresses()[0]?.address, iface).toBe('192.168.1.24')
      vi.doUnmock('node:os')
      vi.resetModules()
    }
  })

  it('prefers IPv4 over IPv6 — a phone user has to TYPE this', () => {
    // An IPv6 literal in a URL needs brackets and is not survivable by
    // hand; the docs say so explicitly.
    return withInterfaces({ en0: [v6('2001:db8::1'), v4('192.168.1.24')] }).then(
      ({ lanAddresses }) => {
        expect(lanAddresses()[0]?.family).toBe('IPv4')
      },
    )
  })

  it('prefers a PRIVATE IPv4 over a public one', () => {
    // A public address on a dev machine is usually a tunnel or a
    // misconfiguration; the phone is on the LAN.
    return withInterfaces({ en0: [v4('203.0.113.5')], en1: [v4('192.168.1.24')] }).then(
      ({ lanAddresses }) => {
        expect(lanAddresses()[0]?.address).toBe('192.168.1.24')
      },
    )
  })

  it('prefers a recognised physical interface name on a tie', () => {
    return withInterfaces({ someAdapter: [v4('192.168.1.9')], en0: [v4('192.168.1.24')] }).then(
      ({ lanAddresses }) => {
        expect(lanAddresses()[0]?.address).toBe('192.168.1.24')
      },
    )
  })
})

describe('addresses that must never be offered', () => {
  it('drops internal (loopback) addresses', async () => {
    const { lanAddresses } = await withInterfaces({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [v4('192.168.1.24')],
    })
    expect(lanAddresses().map((a) => a.address)).toEqual(['192.168.1.24'])
  })

  it('drops IPv4 link-local — 169.254 means DHCP failed', async () => {
    const { lanAddresses } = await withInterfaces({
      en0: [v4('169.254.10.1'), v4('192.168.1.24')],
    })
    expect(lanAddresses().map((a) => a.address)).toEqual(['192.168.1.24'])
  })

  it('drops IPv6 link-local across the WHOLE fe80::/10 range', async () => {
    // The range is the first ten bits, so it is fe80 through febf — not
    // just the literal `fe80` prefix. A machine has one per interface, and
    // eight of them is a SAN list nobody can read.
    const { lanAddresses } = await withInterfaces({
      en0: [v6('fe80::1'), v6('fe9a::1'), v6('feab::1'), v6('febf::1'), v6('2001:db8::1')],
    })
    expect(lanAddresses().map((a) => a.address)).toEqual(['2001:db8::1'])
  })

  it('keeps an fec0:: address, which is NOT link-local', async () => {
    // The boundary on the other side: `fec0` is outside the /10, and
    // dropping it would silently narrow the offered set.
    const { lanAddresses } = await withInterfaces({ en0: [v6('fec0::1')] })
    expect(lanAddresses().map((a) => a.address)).toEqual(['fec0::1'])
  })

  it('drops an address whose family Node reports as something unknown', async () => {
    // Node has reported `family` as both `'IPv4'` and `4` across versions;
    // anything else is a shape this code does not understand, and guessing
    // would put an unusable address at the head of the list.
    const { lanAddresses } = await withInterfaces({
      weird: [{ address: '10.0.0.1', family: 'IPX' as never, internal: false }],
      en0: [v4('192.168.1.24')],
    })
    expect(lanAddresses().map((a) => a.address)).toEqual(['192.168.1.24'])
  })

  it('accepts the NUMERIC family forms Node also uses', async () => {
    const { lanAddresses } = await withInterfaces({
      en0: [{ address: '192.168.1.24', family: 4, internal: false }],
      en1: [{ address: '2001:db8::1', family: 6, internal: false }],
    })
    expect(lanAddresses().map((a) => a.family)).toEqual(['IPv4', 'IPv6'])
  })

  it('returns an empty list when there is nothing usable', async () => {
    // A machine with only loopback — the caller has to degrade rather
    // than index into nothing.
    const { lanAddresses } = await withInterfaces({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    })
    expect(lanAddresses()).toEqual([])
  })

  it('tolerates an interface Node reports with no addresses', async () => {
    const { lanAddresses } = await withInterfaces({
      empty: undefined as never,
      en0: [v4('192.168.1.24')],
    })
    expect(lanAddresses().map((a) => a.address)).toEqual(['192.168.1.24'])
  })
})

describe('the private-IPv4 ranges', () => {
  it('recognises all three RFC1918 blocks and rejects a public address', async () => {
    const { isPrivateV4 } = await withInterfaces({})
    for (const a of ['10.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.1']) {
      expect(isPrivateV4(a), a).toBe(true)
    }
    for (const a of ['172.15.0.1', '172.32.0.1', '203.0.113.5', '8.8.8.8']) {
      expect(isPrivateV4(a), `${a} is public`).toBe(false)
    }
  })
})
