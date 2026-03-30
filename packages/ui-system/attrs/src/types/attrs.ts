/** Callback form of `.attrs()` — receives current props and returns partial overrides. */
export type AttrsCb<A> = (props: Partial<A>) => Partial<A>;
