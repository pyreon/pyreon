// Augment JSX namespace so that `key` is accepted on component elements,
// not just intrinsic HTML elements. Pyreon's jsx() runtime already handles
// key as the third argument — this just satisfies TypeScript.
declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: string | number
    }
  }
}

export {}
