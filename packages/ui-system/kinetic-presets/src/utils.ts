import type { CSSProperties, Preset } from "./types";

const mergeStyle = (
  a: CSSProperties | undefined,
  b: CSSProperties | undefined,
): CSSProperties | undefined => (b ? { ...a, ...b } : a);

const concatClass = (a: string | undefined, b: string | undefined): string | undefined =>
  b ? (a ? `${a} ${b}` : b) : a;

const mergeStyles = (result: Preset, p: Preset): void => {
  result.enterStyle = mergeStyle(result.enterStyle, p.enterStyle);
  result.enterToStyle = mergeStyle(result.enterToStyle, p.enterToStyle);
  result.leaveStyle = mergeStyle(result.leaveStyle, p.leaveStyle);
  result.leaveToStyle = mergeStyle(result.leaveToStyle, p.leaveToStyle);
  if (p.enterTransition) result.enterTransition = p.enterTransition;
  if (p.leaveTransition) result.leaveTransition = p.leaveTransition;
};

const mergeClasses = (result: Preset, p: Preset): void => {
  result.enter = concatClass(result.enter, p.enter);
  result.enterFrom = concatClass(result.enterFrom, p.enterFrom);
  result.enterTo = concatClass(result.enterTo, p.enterTo);
  result.leave = concatClass(result.leave, p.leave);
  result.leaveFrom = concatClass(result.leaveFrom, p.leaveFrom);
  result.leaveTo = concatClass(result.leaveTo, p.leaveTo);
};

export const compose = (...items: Preset[]): Preset => {
  const result: Preset = {};
  for (const p of items) {
    mergeStyles(result, p);
    mergeClasses(result, p);
  }
  return result;
};

export const withDuration = (preset: Preset, enterMs: number, leaveMs?: number): Preset => ({
  ...preset,
  enterTransition: replaceDuration(preset.enterTransition ?? "", `${enterMs}ms`),
  leaveTransition: replaceDuration(preset.leaveTransition ?? "", `${leaveMs ?? enterMs}ms`),
});

export const withEasing = (preset: Preset, enterEasing: string, leaveEasing?: string): Preset => ({
  ...preset,
  enterTransition: replaceEasing(preset.enterTransition ?? "", enterEasing),
  leaveTransition: replaceEasing(preset.leaveTransition ?? "", leaveEasing ?? enterEasing),
});

export const withDelay = (preset: Preset, enterDelayMs: number, leaveDelayMs?: number): Preset => ({
  ...preset,
  enterTransition: addDelay(preset.enterTransition ?? "", `${enterDelayMs}ms`),
  leaveTransition: addDelay(preset.leaveTransition ?? "", `${leaveDelayMs ?? enterDelayMs}ms`),
});

export const reverse = (preset: Preset): Preset => ({
  enterStyle: preset.leaveStyle,
  enterToStyle: preset.leaveToStyle,
  enterTransition: preset.leaveTransition,
  leaveStyle: preset.enterStyle,
  leaveToStyle: preset.enterToStyle,
  leaveTransition: preset.enterTransition,
  enter: preset.leave,
  enterFrom: preset.leaveFrom,
  enterTo: preset.leaveTo,
  leave: preset.enter,
  leaveFrom: preset.enterFrom,
  leaveTo: preset.enterTo,
});

const replaceDuration = (transition: string, newDuration: string): string =>
  transition.replace(/\d{1,10}(?:ms|s)/, newDuration);

const replaceEasing = (transition: string, newEasing: string): string =>
  transition.replace(
    /(?:ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier\([^)]{1,100}\))\s*$/,
    newEasing,
  );

const addDelay = (transition: string, delay: string): string =>
  transition.replace(/(\d{1,10}(?:ms|s))(\s)/, `$1 ${delay}$2`);
