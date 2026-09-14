/**
 * Built-in: merge a component's representative CONTENT under every scenario.
 *
 * Runs after the generators and the default-scenario fill, so it sees every
 * scenario a component will have — and before `fillDefaultsPlugin`, whose job
 * is required props the seed may already satisfy (a `label: string` filled by
 * the name is a real value, not a `'label'` stand-in). Key by key, an authored
 * or generated arg wins over the seed: the seed is what renders when nothing
 * else was said.
 */
import { seedArgs } from '../core'
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

export function contentPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:content',
    decorate(ci) {
      if (!ci.content || Object.keys(ci.content).length === 0) return ci
      return {
        ...ci,
        scenarios: ci.scenarios.map((s) => ({ ...s, args: seedArgs(ci.content, s.args) })),
      }
    },
  })
}
