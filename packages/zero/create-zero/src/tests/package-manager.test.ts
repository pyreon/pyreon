import { describe, expect, it } from 'vitest'
import { detectPackageManager, nextSteps } from '../package-manager'

// The next-steps note printed `bun install` / `bun run dev` even for `npm create @pyreon/zero`.
describe('next steps use the package manager the scaffolder was invoked with', () => {
  it.each([
    ['npm/10.9.0 node/v22.11.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/9.12.0 npm/? node/v22.11.0 darwin arm64', 'pnpm'],
    ['yarn/4.5.1 npm/? node/v22.11.0 darwin arm64', 'yarn'],
    ['bun/1.3.0 npm/? node/v24.3.0 darwin arm64', 'bun'],
  ] as const)('%s -> %s', (agent, pm) => {
    expect(detectPackageManager(agent)).toBe(pm)
  })

  it('falls back to bun when there is no agent or an unknown one', () => {
    expect(detectPackageManager(undefined)).toBe('bun')
    expect(detectPackageManager('')).toBe('bun')
    expect(detectPackageManager('deno/2.0.0')).toBe('bun')
  })

  it('prints each tool’s own install and dev commands', () => {
    expect(nextSteps('my-app', 'npm', 'app')).toEqual(['cd my-app', 'npm install', 'npm run dev'])
    expect(nextSteps('my-app', 'pnpm', 'app')).toEqual(['cd my-app', 'pnpm install', 'pnpm dev'])
    expect(nextSteps('my-app', 'yarn', 'blog')).toEqual(['cd my-app', 'yarn install', 'yarn dev'])
    expect(nextSteps('my-app', 'bun', 'dashboard')).toEqual(['cd my-app', 'bun install', 'bun run dev'])
  })

  it('keeps bun for the monorepo template, whose root scripts call `bun run --filter`', () => {
    expect(nextSteps('mono', 'npm', 'monorepo')).toEqual(['cd mono', 'bun install', 'bun run dev'])
  })
})
