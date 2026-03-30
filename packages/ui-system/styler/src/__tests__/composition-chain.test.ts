/**
 * Integration tests verifying that styler correctly resolves the full
 * CSS composition chain used by rocketstyle + unistyle + makeItResponsive.
 *
 * This tests the EXACT patterns used in production to identify where
 * CSS properties like `position: absolute` might get lost.
 */

import type { VNode } from "@pyreon/core";
import { h } from "@pyreon/core";
import { describe, expect, it } from "vitest";
import { css } from "../css";
import { normalizeCSS, resolve, resolveValue } from "../resolve";
import { createSheet } from "../sheet";
import { styled } from "../styled";

// =====================================================================
// LAYER 1: resolve() with nested CSSResults — the raw resolution chain
// =====================================================================

describe("resolve composition chain", () => {
  describe("CSSResult nesting (css-in-css)", () => {
    it("resolves nested css`...` calls", () => {
      const inner = css`
        color: red;
      `;
      const outer = css`
        ${inner} font-size: 16px;
      `;
      const result = normalizeCSS(resolve(outer.strings, outer.values, {}));
      expect(result).toContain("color: red;");
      expect(result).toContain("font-size: 16px;");
    });

    it("resolves deeply nested css calls (3 levels)", () => {
      const level3 = css`
        position: absolute;
      `;
      const level2 = css`
        ${level3} display: flex;
      `;
      const level1 = css`
        ${level2} color: blue;
      `;
      const result = normalizeCSS(resolve(level1.strings, level1.values, {}));
      expect(result).toContain("position: absolute;");
      expect(result).toContain("display: flex;");
      expect(result).toContain("color: blue;");
    });

    it("resolves array of CSS strings (processDescriptor fragments)", () => {
      // This mimics unistyle/styles/index.ts: fragments array from propertyMap
      const fragments = [
        "",
        "",
        "position: absolute;",
        "",
        "display: flex;",
        "",
        "height: 2.5rem;",
        "",
      ];
      const result = css`
        ${fragments}
      `;
      const resolved = normalizeCSS(resolve(result.strings, result.values, {}));
      expect(resolved).toContain("position: absolute;");
      expect(resolved).toContain("display: flex;");
      expect(resolved).toContain("height: 2.5rem;");
    });

    it("resolves CSSResult wrapping an array of fragments", () => {
      // styles() returns css`${fragments}` where fragments is an array
      const fragments = ["position: absolute;", "", "color: red;"];
      const stylesResult = css`
        ${fragments}
      `;
      // makeItResponsive wraps: css`${renderStyles(theme)}`
      const mirResult = css`
        ${stylesResult}
      `;
      const resolved = normalizeCSS(resolve(mirResult.strings, mirResult.values, {}));
      expect(resolved).toContain("position: absolute;");
      expect(resolved).toContain("color: red;");
    });
  });

  describe("function interpolations (styled component render path)", () => {
    it("resolves function that returns a CSSResult", () => {
      const fn = (props: any) =>
        css`
          color: ${props.color};
        `;
      const template = css`
        ${fn}
      `;
      const result = normalizeCSS(resolve(template.strings, template.values, { color: "red" }));
      expect(result).toContain("color: red;");
    });

    it("resolves function that returns an array (makeItResponsive responsive path)", () => {
      // makeItResponsive returns an array when breakpoints exist
      const fn = () => [
        css`
          position: absolute;
        `,
        css`
          @media (min-width: 36em) {
            font-size: 2rem;
          }
        `,
      ];
      const template = css`
        ${fn}
      `;
      const result = normalizeCSS(resolve(template.strings, template.values, {}));
      expect(result).toContain("position: absolute;");
      expect(result).toContain("@media");
      expect(result).toContain("font-size: 2rem;");
    });

    it("resolves function returning CSSResult containing another function", () => {
      // This is the exact rocketstyle pattern:
      // .styles((css) => css`${({$rocketstyle}) => { ... return css`${baseTheme};` }}`)
      const innerFn = (props: any) => {
        const theme = props.$rocketstyle;
        const fragments = [
          theme.position ? `position: ${theme.position};` : "",
          theme.display ? `display: ${theme.display};` : "",
        ];
        return css`
          ${fragments}
        `;
      };

      const outerResult = css`
        font-weight: 500;
        ${innerFn};
      `;

      const resolved = normalizeCSS(
        resolve(outerResult.strings, outerResult.values, {
          $rocketstyle: { position: "absolute", display: "flex" },
        }),
      );
      expect(resolved).toContain("font-weight: 500;");
      expect(resolved).toContain("position: absolute;");
      expect(resolved).toContain("display: flex;");
    });

    it("resolves the full rocketstyle+unistyle chain pattern", () => {
      // Simulates the full chain:
      // 1. processDescriptor generates CSS string fragments
      // 2. styles() wraps them in css`${fragments}`
      // 3. makeItResponsive wraps in css`${renderStyles(theme)}`
      // 4. For responsive: media wrapper adds @media
      // 5. Returns array of breakpoint results
      // 6. .styles() callback wraps everything

      const unistyleStyles = ({
        theme: t,
        css: cssFn,
      }: {
        theme: Record<string, any>;
        css: typeof css;
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
      }) => {
        const fragments = [
          t.position ? `position: ${t.position};` : "",
          t.display ? `display: ${t.display};` : "",
          t.height ? `height: ${t.height}rem;` : "",
          t.fontSize ? `font-size: ${t.fontSize}rem;` : "",
          t.backgroundColor ? `background-color: ${t.backgroundColor};` : "",
          t.color ? `color: ${t.color};` : "",
        ];
        return cssFn`${fragments}`;
      };

      // Simulate makeItResponsive for non-responsive case
      const makeItResponsiveNonBP = (config: {
        theme: Record<string, any>;
        styles: typeof unistyleStyles;
        css: typeof css;
      }) => {
        return () => {
          const renderStyles = (t: Record<string, any>) =>
            config.styles({ theme: t, css: config.css });
          return config.css`
            ${renderStyles(config.theme)}
          `;
        };
      };

      // Simulate .styles() callback
      const stylesCb = (cssFn: typeof css) => {
        return cssFn`
          font-weight: 500;
          ${(props: any) => {
            const rocketTheme = props.$rocketstyle;
            const baseTheme = makeItResponsiveNonBP({
              theme: rocketTheme,
              styles: unistyleStyles,
              css: cssFn,
            });
            return cssFn`${baseTheme};`;
          }};
        `;
      };

      // This is what calculateStyles produces
      const stylesArray = [stylesCb(css)];

      // This is the styled component template resolution
      const templateStrings = Object.assign(["\n  ", ";\n"], {
        raw: ["\n  ", ";\n"],
      }) as unknown as TemplateStringsArray;

      const resolved = normalizeCSS(
        resolve(templateStrings, [stylesArray], {
          $rocketstyle: {
            position: "absolute",
            display: "flex",
            height: 2.5,
            backgroundColor: "#0070f3",
            color: "#fff",
          },
        }),
      );

      expect(resolved).toContain("position: absolute;");
      expect(resolved).toContain("display: flex;");
      expect(resolved).toContain("height: 2.5rem;");
      expect(resolved).toContain("background-color: #0070f3;");
      expect(resolved).toContain("color: #fff;");
      expect(resolved).toContain("font-weight: 500;");
    });

    it("resolves the full chain with responsive breakpoints", () => {
      const unistyleStyles = ({
        theme: t,
        css: cssFn,
      }: {
        theme: Record<string, any>;
        css: typeof css;
      }) => {
        const fragments = [
          t.position ? `position: ${t.position};` : "",
          t.height ? `height: ${t.height}rem;` : "",
        ];
        return cssFn`${fragments}`;
      };

      // Simulate createMediaQueries
      const createMedia = (cssFn: typeof css, bps: Record<string, number>, rs: number) => {
        const media: Record<string, (...args: any[]) => any> = {};
        for (const [key, value] of Object.entries(bps)) {
          if (value === 0) {
            media[key] = (...args: any[]) => (cssFn as any)(...args);
          } else {
            const emSize = value / rs;
            media[key] = (...args: any[]) => cssFn`
              @media only screen and (min-width: ${emSize}em) {
                ${(cssFn as any)(...args)};
              }
            `;
          }
        }
        return media;
      };

      const breakpoints = { xs: 0, md: 768 };
      const rootSize = 16;
      const media = createMedia(css, breakpoints, rootSize);
      const sortedBreakpoints = ["xs", "md"];

      // Simulate makeItResponsive with responsive path
      const makeItResponsiveResp = (config: {
        theme: Record<string, any>;
        styles: typeof unistyleStyles;
        css: typeof css;
      }) => {
        return (_props: any) => {
          const renderStyles = (t: Record<string, any>) =>
            config.styles({ theme: t, css: config.css });

          // After normalizeTheme + transformTheme + optimizeTheme:
          // position: 'absolute' -> only first breakpoint
          // height: { xs: 2.5, md: 5 } -> different per breakpoint
          const optimizedTheme: Record<string, Record<string, any>> = {
            xs: { position: "absolute", height: 2.5 },
            md: { height: 5 },
          };

          return sortedBreakpoints.map((item) => {
            const breakpointTheme = optimizedTheme[item];
            if (!breakpointTheme || !media) return "";
            const result = renderStyles(breakpointTheme);
            return (media as Record<string, any>)[item]`
              ${result};
            `;
          });
        };
      };

      const stylesCb = (cssFn: typeof css) => {
        return cssFn`
          ${(props: any) => {
            const rocketTheme = props.$rocketstyle;
            const baseTheme = makeItResponsiveResp({
              theme: rocketTheme,
              styles: unistyleStyles,
              css: cssFn,
            });
            return cssFn`${baseTheme};`;
          }};
        `;
      };

      const stylesArray = [stylesCb(css)];

      const templateStrings = Object.assign(["\n  ", ";\n"], {
        raw: ["\n  ", ";\n"],
      }) as unknown as TemplateStringsArray;

      const resolved = normalizeCSS(
        resolve(templateStrings, [stylesArray], {
          $rocketstyle: { position: "absolute", height: { xs: 2.5, md: 5 } },
        }),
      );

      // Base breakpoint (xs) should have position + height
      expect(resolved).toContain("position: absolute;");
      expect(resolved).toContain("height: 2.5rem;");

      // md breakpoint should be in @media
      expect(resolved).toContain("@media");
      expect(resolved).toContain("height: 5rem;");
    });
  });
});

// =====================================================================
// LAYER 2: styled component rendering — verify CSS injection + className
// =====================================================================

describe("styled component composition", () => {
  it("handles array of functions as single interpolation (calculateStyles pattern)", () => {
    // This is EXACTLY what rocketstyle does:
    // styled(component, { boost: true })`${calculateStyles(styles)};`
    // calculateStyles returns an array of function results

    const fn1 = (props: any) => `position: ${props.$rocketstyle?.position ?? "static"};`;
    const fn2 = (props: any) => `color: ${props.$rocketstyle?.color ?? "inherit"};`;

    const Comp = styled("div")`
      ${[fn1, fn2]};
    `;

    const vnode = Comp({ $rocketstyle: { position: "absolute", color: "red" } }) as VNode;
    expect(vnode.props.class).toMatch(/^pyr-/);
  });

  it("handles function returning css`...` with nested function returning array", () => {
    // This mimics the full .styles() -> makeItResponsive -> unistyle chain
    const innerFn = (props: any) => {
      const t = props.$rocketstyle;
      return [t.position ? `position: ${t.position};` : "", t.color ? `color: ${t.color};` : ""];
    };

    const outerCssResult = css`
      font-weight: bold;
      ${innerFn};
    `;

    const Comp = styled("div")`
      ${[outerCssResult]};
    `;

    const vnode = Comp({ $rocketstyle: { position: "absolute", color: "blue" } }) as VNode;
    expect(vnode.props.class).toMatch(/^pyr-/);

    // Verify the CSS resolves correctly
    const cssText = normalizeCSS(
      resolve(outerCssResult.strings, outerCssResult.values, {
        $rocketstyle: { position: "absolute", color: "blue" },
      }),
    );
    expect(cssText).toContain("position: absolute;");
    expect(cssText).toContain("color: blue;");
    expect(cssText).toContain("font-weight: bold;");
  });

  it("handles css result wrapping a makeItResponsive-like function", () => {
    // makeItResponsive returns a FUNCTION
    // This function is used as interpolation in css`${baseTheme};`
    // That css result is used as interpolation in css`${fn};`
    // That css result is in an array from calculateStyles

    const makeItResponsiveLike = (theme: Record<string, any>) => (_props: any) => {
      const fragments = Object.entries(theme).map(([k, v]) => `${k}: ${v};`);
      return css`
        ${fragments}
      `;
    };

    const styleCallback = css`
      font-weight: 500;
      ${(props: any) => {
        const baseTheme = makeItResponsiveLike(props.$rocketstyle);
        return css`
          ${baseTheme};
        `;
      }};
    `;

    const Comp = styled("div")`
      ${[styleCallback]};
    `;

    const vnode = Comp({ $rocketstyle: { position: "absolute", display: "flex" } }) as VNode;
    expect(vnode.props.class).toMatch(/^pyr-/);

    // Resolve manually to verify CSS content
    const cssText = normalizeCSS(
      resolve(styleCallback.strings, styleCallback.values, {
        $rocketstyle: { position: "absolute", display: "flex" },
      }),
    );
    expect(cssText).toContain("position: absolute;");
    expect(cssText).toContain("display: flex;");
  });

  it("wrapping a component: outer styled inherits inner className", () => {
    // Inner is a Pyreon component wrapped by rocketstyle's styled()
    const Inner = (props: { class?: string; $rocketstyle?: any; "data-testid"?: string }) =>
      h("div", { class: props.class, "data-testid": "inner" });

    const Outer = styled(Inner)`
      ${(props: any) => {
        const t = props.$rocketstyle || {};
        return `position: ${t.position || "static"};`;
      }};
    `;

    const vnode = Outer({ $rocketstyle: { position: "absolute" } }) as VNode;
    // Outer renders Inner, passing className
    expect(vnode.props.class).toMatch(/^pyr-/);
  });

  it("CSS output contains all properties from composition chain", () => {
    const fragments = [
      "position: absolute;",
      "",
      "display: flex;",
      "height: 2.5rem;",
      "",
      "background-color: #0070f3;",
    ];
    const cssText = normalizeCSS(
      resolve(
        css`
          ${fragments}
        `.strings,
        css`
          ${fragments}
        `.values,
        {},
      ),
    );

    // Verify the resolved CSS text contains all declarations
    expect(cssText).toContain("position: absolute;");
    expect(cssText).toContain("display: flex;");
    expect(cssText).toContain("height: 2.5rem;");
    expect(cssText).toContain("background-color: #0070f3;");

    // Verify it can be inserted into a sheet
    const s = createSheet();
    const className = s.insert(cssText);
    expect(className).toMatch(/^pyr-/);
  });

  it("handles the exact rocketstyle pattern with ThemeProvider context", () => {
    // Full pattern: styled component -> function interpolation
    // -> css result -> function -> css result -> array fragments
    // Note: In VNode-level testing, we verify resolve output directly
    // since ThemeProvider requires runtime context.

    const innerFn = (props: any) => {
      const t = props.$rocketstyle || {};
      const fragments = [
        t.position ? `position: ${t.position};` : "",
        t.color ? `color: ${t.color};` : "",
        t.fontSize ? `font-size: ${t.fontSize};` : "",
      ];
      return css`
        ${fragments}
      `;
    };

    const Comp = styled("div")`
      ${(props: any) => {
        const t = props.$rocketstyle || {};
        const fragments = [
          t.position ? `position: ${t.position};` : "",
          t.color ? `color: ${t.color};` : "",
          t.fontSize ? `font-size: ${t.fontSize};` : "",
        ];
        return css`
          ${fragments}
        `;
      }};
    `;

    const vnode = Comp({
      $rocketstyle: {
        position: "absolute",
        color: "#fff",
        fontSize: "14px",
      },
    }) as VNode;
    expect(vnode.props.class).toMatch(/^pyr-/);

    // Also verify the CSS text resolves correctly
    const resolved = normalizeCSS(
      resolveValue(innerFn, {
        $rocketstyle: {
          position: "absolute",
          color: "#fff",
          fontSize: "14px",
        },
      }),
    );
    expect(resolved).toContain("position: absolute;");
    expect(resolved).toContain("color: #fff;");
    expect(resolved).toContain("font-size: 14px;");
  });
});
