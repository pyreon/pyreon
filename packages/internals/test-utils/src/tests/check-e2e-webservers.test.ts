// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { webServerProblems } from '../../../../../scripts/check-e2e-webservers'

/**
 * #4751: `ssg-subpath` had a second webServer `tail -f /dev/null` waiting for
 * a port the first entry's command opened. Locally `reuseExistingServer` hid
 * it; in CI Playwright refused the taken port ("is already used").
 */
describe('check-e2e-webservers', () => {
  it('flags a placeholder entry that waits for another entry\'s port', () => {
    const problems = webServerProblems('ssg-subpath.config.ts', [
      { command: 'build && (preview --port 5198 & preview --port 5199 & wait)', port: 5198 },
      { command: 'tail -f /dev/null', port: 5199 },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/starts nothing and waits for 5199/)
  })

  it('flags two entries waiting for the same port', () => {
    expect(webServerProblems('x.config.ts', [{ command: 'a', port: 5100 }, { command: 'b', port: 5100 }])[0]).toMatch(
      /webServer #2 waits for 5100, which webServer #1 already uses/,
    )
  })

  it('accepts one real server per port', () => {
    expect(
      webServerProblems('ok.config.ts', [
        { command: 'build:a && preview:a --port 5198', port: 5198 },
        { command: 'build:b && preview:b --port 5236', port: 5236 },
      ]),
    ).toEqual([])
  })
})
