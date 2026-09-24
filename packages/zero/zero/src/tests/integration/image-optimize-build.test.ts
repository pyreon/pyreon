/**
 * A real `vite build` of a `?optimize` import. Nothing else in the repo
 * builds one (the ssr-showcase probe deliberately avoids it), so this is the
 * only check that the emitted files and the descriptor the page imports agree.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterAll, expect, it } from 'vitest'
import { imagePlugin } from '../../image-plugin'

const root = mkdtempSync(join(tmpdir(), 'zero-img-build-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

it('emits content-hashed variants and a descriptor that points at them', async () => {
  const sharp = await import('sharp').then((m) => m.default ?? m)
  writeFileSync(
    join(root, 'hero.png'),
    await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 9, g: 9, b: 9 } } } as never)
      .png()
      .toBuffer(),
  )
  writeFileSync(join(root, 'main.js'), "import hero from './hero.png?optimize'\nexport const src = hero.srcset\n")

  await build({
    root,
    configFile: false,
    logLevel: 'error',
    plugins: [imagePlugin({ widths: [640, 1920], placeholder: 'none' })],
    build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: join(root, 'main.js') } },
  })

  const emitted = readdirSync(join(root, 'dist/assets/img')).sort()
  expect(emitted).toHaveLength(2)
  for (const f of emitted) expect(f).toMatch(/^hero-[0-9a-f]{8}-(640|800)\.webp$/)
  const js = readdirSync(join(root, 'dist/assets')).find((f) => f.endsWith('.js'))!
  const bundle = readFileSync(join(root, 'dist/assets', js), 'utf8')
  for (const f of emitted) expect(bundle).toContain(`/assets/img/${f}`)
}, 120_000)
