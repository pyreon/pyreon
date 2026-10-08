import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'
export const storeStubs: StubAugmentation = Object.freeze({
  swift: (source: string) =>
    /\bPyreonStoreProtocol\b/.test(source)
      ? 'public protocol PyreonStoreProtocol: AnyObject {}\n'
      : '',
  kotlin: (source: string) => (/\bPyreonStore\b/.test(source) ? 'interface PyreonStore\n' : ''),
})
