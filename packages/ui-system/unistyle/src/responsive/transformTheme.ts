import { isEmpty, set } from "@pyreon/ui-core";

const removeUnexpectedKeys = (obj: Record<string, unknown>, keys: string[]) => {
  const result: Record<string, unknown> = {};
  keys.forEach((bp) => {
    const value = obj[bp];
    if (value) {
      result[bp] = value;
    }
  });
  return result;
};

export type TransformTheme = ({
  theme,
  breakpoints,
}: {
  theme: Record<string, unknown>;
  breakpoints: string[];
}) => any;

const transformTheme: TransformTheme = ({ theme, breakpoints }) => {
  const result = {};

  if (isEmpty(theme) || isEmpty(breakpoints)) return result;

  Object.entries(theme).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      value.forEach((child, i) => {
        const indexBreakpoint = breakpoints[i];
        if (indexBreakpoint == null) return;
        set(result, [indexBreakpoint, key], child);
      });
    } else if (typeof value === "object" && value !== null) {
      Object.entries(value).forEach(([childKey, childValue]) => {
        set(result, [childKey, key], childValue);
      });
    } else if (value != null) {
      const firstBreakpoint = breakpoints[0];
      if (firstBreakpoint == null) return;
      set(result, [firstBreakpoint, key], value);
    }
  });

  return removeUnexpectedKeys(result, breakpoints);
};

export default transformTheme;
