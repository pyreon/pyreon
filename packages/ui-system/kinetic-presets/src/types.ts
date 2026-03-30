/** CSS properties as inline style object. Framework-agnostic alternative to React.CSSProperties. */
export type CSSProperties = Record<string, string | number | undefined>;

export type Preset = {
  enterStyle?: CSSProperties | undefined;
  enterToStyle?: CSSProperties | undefined;
  enterTransition?: string | undefined;
  leaveStyle?: CSSProperties | undefined;
  leaveToStyle?: CSSProperties | undefined;
  leaveTransition?: string | undefined;
  enter?: string | undefined;
  enterFrom?: string | undefined;
  enterTo?: string | undefined;
  leave?: string | undefined;
  leaveFrom?: string | undefined;
  leaveTo?: string | undefined;
};

export type Direction = "up" | "down" | "left" | "right";

export type FadeOptions = {
  direction?: Direction;
  distance?: number;
  duration?: number;
  leaveDuration?: number;
  easing?: string;
  leaveEasing?: string;
};

export type SlideOptions = {
  direction?: Direction;
  distance?: number;
  duration?: number;
  leaveDuration?: number;
  easing?: string;
  leaveEasing?: string;
};

export type ScaleOptions = {
  from?: number;
  duration?: number;
  leaveDuration?: number;
  easing?: string;
  leaveEasing?: string;
};

export type RotateOptions = {
  degrees?: number;
  duration?: number;
  leaveDuration?: number;
  easing?: string;
  leaveEasing?: string;
};

export type BlurOptions = {
  amount?: number;
  scale?: number;
  duration?: number;
  leaveDuration?: number;
  easing?: string;
  leaveEasing?: string;
};
