import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const viewSource = readFileSync(
  join(import.meta.dirname, '..', '..', 'native', 'swift', 'PyreonFlowView.swift'),
  'utf8',
)

describe('native iOS connection handles', () => {
  it('claim drags before an enclosing ScrollView', () => {
    const handleView = viewSource.slice(
      viewSource.indexOf('private func handleView'),
      viewSource.indexOf('private var resizersLayer'),
    )

    expect(handleView).toContain('.highPriorityGesture(connectionGesture(handle))')
    expect(handleView).not.toContain('.gesture(connectionGesture(handle))')
  })
})
