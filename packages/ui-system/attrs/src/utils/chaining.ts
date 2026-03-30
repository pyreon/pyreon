type Func = (...args: any) => Record<string, unknown>;
type Obj = Record<string, unknown>;

/**
 * Appends a new attrs option to the existing chain of option functions.
 *
 * The `.attrs()` API accepts either an object or a callback. This function
 * normalizes both forms into a function (objects are wrapped in `() => obj`)
 * and appends to the existing array. The array is cloned so each chained
 * component gets its own copy — maintaining immutability across the chain.
 */
type ChainOptions = (opts: Obj | Func | undefined, defaultOpts: Func[]) => Func[];

export const chainOptions: ChainOptions = (opts, defaultOpts = []) => {
  const result = [...defaultOpts];

  if (typeof opts === "function") result.push(opts);
  else if (typeof opts === "object") result.push(() => opts);

  return result;
};
