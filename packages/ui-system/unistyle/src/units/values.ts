import value from "./value";

type CssUnits =
  | "px"
  | "rem"
  | "%"
  | "em"
  | "ex"
  | "cm"
  | "mm"
  | "in"
  | "pt"
  | "pc"
  | "ch"
  | "vh"
  | "vw"
  | "vmin"
  | "vmax";

type GetValueOf = (...args: unknown[]) => number | string;
const getValueOf: GetValueOf = (...args: any[]) =>
  args.find((v) => typeof v !== "undefined" && v !== null);

export type Values = (
  items: unknown[],
  rootSize?: number,
  outputUnit?: CssUnits,
) => string | number | null;

const values: Values = (items, rootSize, outputUnit) => {
  const param = getValueOf(...items);

  if (Array.isArray(param)) {
    return param.map((item) => value(item, rootSize, outputUnit)).join(" ");
  }

  return value(param, rootSize, outputUnit);
};

export default values;
