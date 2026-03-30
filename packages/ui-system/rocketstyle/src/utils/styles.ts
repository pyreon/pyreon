import { config } from "@pyreon/ui-core";
import type { StylesCbArray } from "../types/styles";

// --------------------------------------------------------
// Calculate styles
// --------------------------------------------------------
/**
 * Evaluates an array of style callback functions with the configured
 * `css` tagged-template helper, producing the final CSS interpolations
 * to be passed into the styled-component template literal.
 */
type CalculateStyles = (styles: StylesCbArray | undefined) => ReturnType<StylesCbArray[number]>[];

export const calculateStyles: CalculateStyles = (styles) => {
  if (!styles) return [];

  return styles.map((item) => item(config.css as Parameters<typeof item>[0]));
};
