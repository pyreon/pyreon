import { h } from '@pyreon/core'

export default function VaultNotFound() {
  return h('p', { 'data-testid': 'vault-not-found' }, 'not in the vault')
}
