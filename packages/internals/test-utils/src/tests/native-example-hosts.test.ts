import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { listNativeHosts } from '../../../../../scripts/native-example-hosts'
import { exampleHostDirs } from '../../../../zero/create-multiplatform/src/tests/example-hosts'

const REPO = resolve(import.meta.dirname, '../../../../..')

describe('listNativeHosts', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'native-hosts-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const touch = (rel: string): void => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), '')
  }

  it('finds split hosts and single-layout hosts, each with its emit script', () => {
    mkdirSync(join(root, 'examples/native-counter-ios'), { recursive: true })
    mkdirSync(join(root, 'examples/native-counter-android'), { recursive: true })
    touch('examples/native-today/ios/project.yml')
    touch('examples/native-today/android/settings.gradle.kts')
    mkdirSync(join(root, 'examples/native-tasks/src'), { recursive: true }) // shared source, no host
    mkdirSync(join(root, 'examples/native-tasks-web'), { recursive: true }) // web sibling, no host
    touch('examples/native-half/ios/README.md') // an ios/ folder without a project is not a host
    expect(listNativeHosts(root).map((h) => [h.app, h.platform, h.dir, h.buildScript, h.layout])).toEqual([
      ['counter', 'android', 'examples/native-counter-android', 'examples/native-counter-android/scripts/build.sh', 'split'],
      ['counter', 'ios', 'examples/native-counter-ios', 'examples/native-counter-ios/scripts/build.sh', 'split'],
      ['today', 'android', 'examples/native-today/android', 'examples/native-today/scripts/build-android.sh', 'single'],
      ['today', 'ios', 'examples/native-today/ios', 'examples/native-today/scripts/build-ios.sh', 'single'],
    ])
  })

  it('lists the real apps: every one is one directory with ios/ and android/', () => {
    const hosts = listNativeHosts(REPO)
    for (const app of ['showcase', 'finance', 'counter', 'router-demo', 'tasks', 'todomvc']) {
      expect(hosts.filter((h) => h.app === app).map((h) => `${h.layout} ${h.dir}`)).toEqual([
        `single examples/native-${app}/android`,
        `single examples/native-${app}/ios`,
      ])
    }
    expect(hosts.filter((h) => h.layout === 'split')).toEqual([])
  })

  it('agrees with the restated listing the create-multiplatform tests use', () => {
    for (const platform of ['ios', 'android'] as const) {
      expect(exampleHostDirs(REPO, platform)).toEqual(
        listNativeHosts(REPO)
          .filter((h) => h.platform === platform)
          .map((h) => h.dir)
          .sort(),
      )
    }
  })
})
