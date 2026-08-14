---
'@pyreon/zero': minor
'@pyreon/hooks': patch
---

New `https()` plugin — HTTPS for the dev server, so secure-context browser APIs can be tested on a real device.

```ts
import { https } from '@pyreon/zero/server'
plugins: [zero(), https({ lan: true })]
```

**Not for localhost.** `http://localhost` is already a secure context. It exists because a phone reaches your dev server at `http://192.168.1.24:3000`, which is not — so `useCamera`, `useGeolocation`, `useDeviceMotion`, `useAudioRecorder`, `useSpeech`, `useBluetooth`, `useClipboard`, `useNotifications`, `usePush`, `useShare`, `useWakeLock`, service workers and `crypto.subtle` are all unavailable exactly where they most need testing. A laptop has no accelerometer.

`lan: true` certifies this machine's network address **and** binds the server to it; certifying an address the server never binds to would produce a certificate nothing can reach.

Certificates come from three tiers: `{ cert, key }` if supplied; a local `mkcert` CA if one is already installed and trusted (no browser warning); otherwise a self-signed certificate generated with zero dependencies, which works immediately behind a one-time interstitial. **Pyreon never installs a certificate authority** — a local CA key can mint a valid certificate for any domain, so trusting one is a deliberate user action (`mkcert -install`), not a side effect of adding a plugin. Custom hosts are supported; `*.localhost` resolves natively, and anything else has its `/etc/hosts` lines printed rather than written.

Dev and preview only, HTTP/1.1 (Vite's dev server has not offered HTTP/2 since v3). The certificate is cached under `node_modules/.pyreon-https` and reissued when the host list changes or expiry approaches.

`@pyreon/hooks` gains the matching diagnostic: hooks that need a secure context now explain why they are unavailable instead of silently reporting "unsupported". It fires only when `isSecureContext` is actually `false`, so it never blames TLS for an API the browser genuinely does not implement.
