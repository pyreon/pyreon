import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'
export const modelStubs: StubAugmentation = Object.freeze({
  swift: (source) =>
    /\bPyreonModelProtocol\b/.test(source)
      ? 'public protocol PyreonModelProtocol: AnyObject {}\n'
      : '',
  kotlin: (source) =>
    /\bPyreonModelProtocol\b/.test(source) ? 'interface PyreonModelProtocol\n' : '',
})
