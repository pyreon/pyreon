import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'
export const storeStubs: StubAugmentation = Object.freeze({
  swift: () => 'public protocol PyreonStoreProtocol: AnyObject {}\n',
  kotlin: () => 'interface PyreonStore\n',
})
