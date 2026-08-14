/**
 * `https()` — HTTPS for the dev server, out of the box.
 *
 *   import { https } from '@pyreon/zero/server'
 *
 *   plugins: [
 *     zero(),
 *     https(),                                // localhost over TLS
 *     https({ lan: true }),                   // + your LAN address, for a real device
 *     https({ hosts: ['app.localhost'] }),    // + a custom domain
 *     https({ cert: './dev.pem', key: './dev-key.pem' }),  // bring your own
 *   ]
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Not for localhost. `http://localhost` is ALREADY a secure context, so on
 * your own machine the gated browser APIs work without any of this.
 *
 * It exists because a real device reaches your dev server over the LAN, and
 * `http://192.168.1.24:3000` is NOT a secure context. Pyreon ships a dozen
 * hooks that browsers gate behind one — `useCamera`, `useGeolocation`,
 * `useDeviceMotion`, `useAudioRecorder`, `useSpeech`, `useBluetooth`,
 * `useClipboard`, `useNotifications`, `usePush`, `useShare`, `useWakeLock` —
 * and every one of them can only be tested meaningfully on a phone. A laptop
 * has no accelerometer. So the hooks that most need device testing are exactly
 * the ones that cannot be device-tested over plain HTTP.
 *
 * Worse, they fail SILENTLY: `navigator.geolocation` is simply `undefined` on
 * an insecure origin, so the hook reports "unavailable" with nothing to
 * diagnose. `https({ lan: true })` is the fix; the matching diagnostic lives in
 * `@pyreon/hooks` (`warnIfInsecureContext`), which is what tells you that you
 * needed it in the first place.
 */
import type { Plugin } from 'vite'

import { type Certificate, resolveCertificate } from './cert'
import { hostsFileHint, type LanAddress, resolveHosts } from './hosts'

export type { Certificate, CertTier } from './cert'
export type { LanAddress } from './hosts'
export { lanAddresses, hostsFileHint, needsHostsFileEntry } from './hosts'
export { createSelfSignedCert } from './selfsign'

export interface HttpsOptions {
  /**
   * Extra names to certify, beyond loopback — e.g. `['app.localhost']`.
   *
   * Prefer a `*.localhost` name: it resolves to loopback natively, with no
   * hosts-file entry. Anything else (`.test`, a real domain) needs a line in
   * `/etc/hosts`, which is PRINTED for you and never written.
   */
  hosts?: string[]
  /**
   * Certify this machine's LAN addresses and bind the server to them, so a
   * phone on the same network can connect over TLS. This is the reason to
   * reach for the plugin at all.
   *
   * Note what it implies: binding to your network interfaces makes the dev
   * server — and anything it serves, including source and env values exposed
   * to the client — reachable by **anyone else on that network**. That is the
   * same exposure as Vite's `--host`, and it is the point of the option, but
   * it is worth knowing before enabling it on a network you do not control.
   */
  lan?: boolean
  /** Bring your own certificate. Both required together; nothing is generated. */
  cert?: string
  key?: string
  /**
   * Skip mkcert detection and always self-sign. Useful when you want the
   * certificate to be reproducible regardless of what is installed.
   */
  selfSigned?: boolean
  /** Suppress the extra banner lines. The certificate still applies. */
  quiet?: boolean
}

/**
 * A Vite plugin, so it works identically under `zero dev`, `zero preview` and
 * a plain `vite dev` — none of them need to know it exists.
 */
export function https(options: HttpsOptions = {}): Plugin {
  let certificate: Certificate | null = null
  let lan: LanAddress[] = []
  let hostsHint: string | null = null

  return {
    name: 'pyreon:https',
    // Certificates must be resolved before the server is constructed, and
    // `config` is the only hook that runs early enough to influence it.
    config(config, env) {
      // Dev and preview only. A build has no server, and generating a
      // certificate during CI would be pure waste.
      if (env.command !== 'serve') return undefined

      const resolved = resolveHosts({ hosts: options.hosts, lan: options.lan })
      lan = resolved.lan
      hostsHint = hostsFileHint(resolved.all)

      certificate = resolveCertificate({
        hosts: resolved.all,
        root: config.root ?? process.cwd(),
        ...(options.cert !== undefined ? { certFile: options.cert } : {}),
        ...(options.key !== undefined ? { keyFile: options.key } : {}),
        ...(options.selfSigned === true ? { preferSelfSigned: true } : {}),
      })

      const tls = { cert: certificate.cert, key: certificate.key }
      return {
        server: {
          https: tls,
          // Certifying a LAN address while the server stays bound to loopback
          // would be a certificate for an address nothing can reach. The two
          // belong together, so `lan: true` implies host binding.
          ...(options.lan === true ? { host: true } : {}),
        },
        preview: {
          https: tls,
          ...(options.lan === true ? { host: true } : {}),
        },
      }
    },

    configureServer(server) {
      if (options.quiet === true) return
      const original = server.printUrls.bind(server)
      server.printUrls = () => {
        original()
        // `logger.info` rather than `console.log`: it honours `logLevel`,
        // `clearScreen` and a custom logger, so the banner behaves like the
        // rest of Vite's output instead of punching through it.
        server.config.logger.info(bannerLines(certificate, lan, hostsHint).join('\n'))
      }
    },

    configurePreviewServer(server) {
      if (options.quiet === true) return
      const original = server.printUrls.bind(server)
      server.printUrls = () => {
        original()
        server.config.logger.info(bannerLines(certificate, lan, hostsHint).join('\n'))
      }
    },
  }
}

/**
 * The lines printed under Vite's own URL list.
 *
 * Pure and exported so the wording is unit-testable — a banner that lies about
 * whether you have a secure context is worse than no banner, because the whole
 * point is to answer "will the camera work on my phone?" without making you
 * find out by failing.
 */
export function bannerLines(
  certificate: Certificate | null,
  lan: LanAddress[],
  hostsHint: string | null,
): string[] {
  if (certificate === null) return []
  const out: string[] = ['']

  if (lan.length > 0) {
    const primary = lan[0]!
    out.push(
      `  Secure context on ${primary.address} (${primary.iface}) — camera, geolocation,`,
      '  motion and service workers will work on a device on this network.',
    )
  } else {
    out.push('  Secure context — HTTPS is on for this dev server.')
  }

  if (certificate.tier === 'self-signed') {
    out.push(
      '',
      '  This certificate is self-signed, so the browser will warn once and let',
      '  you continue. For a warning-free certificate, install mkcert and its',
      '  local CA — this plugin will then use it automatically:',
      '',
      '      brew install mkcert && mkcert -install     # macOS',
      '',
      '  Pyreon never installs a certificate authority itself: a local CA key',
      '  can mint a certificate for any domain, so trusting one is your call.',
    )
  } else if (certificate.tier === 'mkcert') {
    out.push('  Certificate issued by your local mkcert CA — no browser warning.')
  }

  if (hostsHint !== null) {
    out.push('', ...hostsHint.split('\n').map((l) => (l.length > 0 ? `  ${l}` : l)))
  }

  out.push('')
  return out
}
