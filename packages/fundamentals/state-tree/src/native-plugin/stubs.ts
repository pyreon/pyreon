import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'
export const modelStubs: StubAugmentation = Object.freeze({
  swift: () => 'public protocol PyreonModelProtocol: AnyObject {}\n',
  kotlin: () => 'interface PyreonModelProtocol\n',
})
