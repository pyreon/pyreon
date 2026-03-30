import { popContext, pushContext } from "@pyreon/core";
import { context } from "../context/context";
import { localContext, useLocalContext } from "../context/localContext";
import usePseudoState from "../hooks/usePseudoState";
import useThemeAttrs from "../hooks/useTheme";

describe("usePseudoState", () => {
  it("returns initial state with all false", () => {
    const { state } = usePseudoState({});
    expect(state.hover).toBe(false);
    expect(state.focus).toBe(false);
    expect(state.pressed).toBe(false);
  });

  it("returns event handlers", () => {
    const { events } = usePseudoState({});
    expect(typeof events.onMouseEnter).toBe("function");
    expect(typeof events.onMouseLeave).toBe("function");
    expect(typeof events.onMouseDown).toBe("function");
    expect(typeof events.onMouseUp).toBe("function");
    expect(typeof events.onFocus).toBe("function");
    expect(typeof events.onBlur).toBe("function");
  });

  it("sets hover on mouseEnter", () => {
    const { state, events } = usePseudoState({});
    events.onMouseEnter({} as any);
    expect(state.hover).toBe(true);
  });

  it("clears hover and pressed on mouseLeave", () => {
    const { state, events } = usePseudoState({});
    events.onMouseEnter({} as any);
    events.onMouseDown({} as any);
    expect(state.hover).toBe(true);
    expect(state.pressed).toBe(true);

    events.onMouseLeave({} as any);
    expect(state.hover).toBe(false);
    expect(state.pressed).toBe(false);
  });

  it("sets pressed on mouseDown, clears on mouseUp", () => {
    const { state, events } = usePseudoState({});
    events.onMouseDown({} as any);
    expect(state.pressed).toBe(true);

    events.onMouseUp({} as any);
    expect(state.pressed).toBe(false);
  });

  it("sets focus on focus, clears on blur", () => {
    const { state, events } = usePseudoState({});
    events.onFocus({} as any);
    expect(state.focus).toBe(true);

    events.onBlur({} as any);
    expect(state.focus).toBe(false);
  });

  it("calls user-provided event handlers", () => {
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onMouseDown = vi.fn();
    const onMouseUp = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();

    const { events } = usePseudoState({
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
      onFocus,
      onBlur,
    });

    const mockEvent = {} as any;
    events.onMouseEnter(mockEvent);
    events.onMouseLeave(mockEvent);
    events.onMouseDown(mockEvent);
    events.onMouseUp(mockEvent);
    events.onFocus(mockEvent);
    events.onBlur(mockEvent);

    expect(onMouseEnter).toHaveBeenCalledWith(mockEvent);
    expect(onMouseLeave).toHaveBeenCalledWith(mockEvent);
    expect(onMouseDown).toHaveBeenCalledWith(mockEvent);
    expect(onMouseUp).toHaveBeenCalledWith(mockEvent);
    expect(onFocus).toHaveBeenCalledWith(mockEvent);
    expect(onBlur).toHaveBeenCalledWith(mockEvent);
  });
});

describe("useThemeAttrs", () => {
  let pushed = false;

  afterEach(() => {
    if (pushed) {
      popContext();
      pushed = false;
    }
  });

  it("returns default values when no context", () => {
    const result = useThemeAttrs({ inversed: false });
    expect(result.theme).toEqual({});
    expect(result.mode).toBe("light");
    expect(result.isLight).toBe(true);
  });

  it("reads theme from context", () => {
    pushContext(
      new Map([
        [
          context.id,
          {
            theme: { rootSize: 16 },
            mode: "light",
            isDark: false,
            isLight: true,
          },
        ],
      ]),
    );
    pushed = true;

    const result = useThemeAttrs({ inversed: false });
    expect(result.theme).toEqual({ rootSize: 16 });
    expect(result.mode).toBe("light");
  });

  it("inverts mode when inversed is true", () => {
    pushContext(
      new Map([
        [
          context.id,
          {
            theme: { rootSize: 16 },
            mode: "light",
            isDark: false,
            isLight: true,
          },
        ],
      ]),
    );
    pushed = true;

    const result = useThemeAttrs({ inversed: true });
    expect(result.mode).toBe("dark");
    expect(result.isDark).toBe(true);
    expect(result.isLight).toBe(false);
  });

  it("inverts dark to light", () => {
    pushContext(
      new Map([
        [
          context.id,
          {
            theme: {},
            mode: "dark",
            isDark: true,
            isLight: false,
          },
        ],
      ]),
    );
    pushed = true;

    const result = useThemeAttrs({ inversed: true });
    expect(result.mode).toBe("light");
    expect(result.isDark).toBe(false);
    expect(result.isLight).toBe(true);
  });
});

describe("useLocalContext", () => {
  let pushed = false;

  afterEach(() => {
    if (pushed) {
      popContext();
      pushed = false;
    }
  });

  it("returns default pseudo when no consumer", () => {
    const result = useLocalContext(null);
    expect(result).toEqual({ pseudo: {} });
  });

  it("returns default pseudo when consumer is undefined", () => {
    const result = useLocalContext(undefined);
    expect(result).toEqual({ pseudo: {} });
  });

  it("calls consumer with getter function", () => {
    pushContext(new Map([[localContext.id, { pseudo: { hover: true } }]]));
    pushed = true;

    const consumer = (getter: any) => getter((ctx: any) => ({ myPseudo: ctx.pseudo }));

    const result = useLocalContext(consumer);
    expect(result.myPseudo).toEqual({ hover: true });
  });
});
