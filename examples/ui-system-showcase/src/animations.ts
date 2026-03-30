import { fade, kinetic, slideDown, slideUp } from "@pyreon/kinetic";
import {
  compose,
  fadeDown,
  fadeUp,
  scaleUp,
  withDuration,
  withEasing,
} from "@pyreon/kinetic-presets";

export const FadeIn = kinetic("div").preset(fade);
export const SlideUp = kinetic("div").preset(slideUp);
export const SlideDown = kinetic("div").preset(slideDown);

// Composed preset: fade up + scale with custom duration
const heroPreset = compose(fadeUp, scaleUp);
const heroAnimation = withDuration(withEasing(heroPreset, "ease-out"), 600);
export const HeroFade = kinetic("div").preset(heroAnimation);

// Notification preset
const notifPreset = withDuration(fadeDown, 300);
export const NotifFade = kinetic("div").preset(notifPreset);
