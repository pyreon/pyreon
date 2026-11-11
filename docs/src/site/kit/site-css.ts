import { color, font, gradient, layout, motion, navMedia, radius, text, weight, z, type ColorKey } from '../theme'

const pulse = motion.pulse
import { C } from './classes'

/**
 * The plain stylesheet for the site's ISLANDS (the nav, copy buttons, the
 * counter, the loops), generated from `theme.ts`.
 *
 * Why not rocketstyle: an island hydrates in the browser on a static page,
 * and a rocketstyle component there needs the UI system's styling runtime
 * (styler, unistyle, rocketstyle, elements, ui-core: ~25 KB gzip) just to
 * compute class names the server already printed. Islands therefore render
 * plain elements with the fixed class names in `classes.ts`, and this sheet
 * styles them. It is injected by `SiteShell` (server render, and the docs
 * app's client render), never by an island, so no island imports a styling
 * runtime. Static content keeps using the rocketstyle kit: it renders only on
 * the server.
 *
 * Colours are custom properties (`--c-<token>`) switched by
 * `<html data-theme>`, the same attribute the kit's CSS-variables mode uses.
 * Everything sits in `@layer site`, declared last in index.html.
 */

const v = (key: ColorKey) => `var(--c-${key})`
const vars = (mode: 'dark' | 'light') =>
  (Object.keys(color) as ColorKey[]).map((k) => `--c-${k}:${color[k][mode]};`).join('') +
  `--c-ember:${gradient.ember[mode]};`

const focus = `outline:2px solid ${v('focus')};outline-offset:2px;`
const reset = 'margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;'

export const SITE_CSS_KEY = 'pyreon-site-islands-v1'

export const SITE_CSS = `@layer site{
:root,:root[data-theme=dark]{${vars('dark')}}
:root[data-theme=light]{${vars('light')}}
pyreon-island{display:contents}
*,*::before,*::after{box-sizing:border-box}
body{margin:0}
.${C.srOnly}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}

.${C.header}{position:fixed;top:${layout.navTop}px;left:0;right:0;z-index:${z.nav};padding:0 ${layout.gutter.xs}px;pointer-events:none}
.${C.bar}{position:relative;z-index:${z.panel};pointer-events:auto;display:flex;align-items:center;gap:8px;max-width:${layout.navMaxWidth}px;height:${layout.navHeight}px;margin:0 auto;padding:0 8px 0 16px;border:1px solid ${v('line')};border-radius:${radius.pill}px;background:${v('glass')};backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);font-family:${font.sans}}
@media (min-width:576px){.${C.bar}{padding-left:20px}}
@media (min-width:992px){.${C.bar}{gap:24px}}
.${C.mark}{display:inline-flex;align-items:center;gap:10px;flex-shrink:0;color:${v('strong')};text-decoration:none;border-radius:${radius.small}px}
.${C.mark}:focus-visible{${focus}}
.${C.wordmark}{font-weight:${text.wordmark.weight};font-size:${text.wordmark.size}px;letter-spacing:-.02em}
@media (max-width:379.98px){.${C.wordmark}{display:none}}
.${C.crumbs}{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-left:18px;border-left:1px solid ${v('line')};font-family:${font.mono};font-size:11.5px;color:${v('fog')}}
${navMedia.collapsed}{.${C.crumbs}{display:none}}
.${C.crumbs} a{color:${v('fog')};text-decoration:none;border-radius:4px}
.${C.crumbs} a:hover{color:${v('text')}}
.${C.crumbs} a:focus-visible{${focus}}
.${C.crumbs} [aria-current]{color:${v('text')}}
.${C.nav}{display:flex;align-items:center;gap:22px;height:100%}
${navMedia.collapsed}{.${C.nav}{display:none}}
.${C.navLink}{${reset}display:inline-flex;align-items:center;gap:6px;height:100%;font-size:${text.navLink.size}px;color:${v('mist')};text-decoration:none;white-space:nowrap;cursor:pointer;transition:color ${motion.hover}}
.${C.navLink}:hover,.${C.navLink}[aria-current],.${C.navLink}[aria-expanded=true],.${C.navLink}.${C.isCurrent}{color:${v('text')}}
.${C.navLink}:focus-visible{${focus};border-radius:${radius.small}px}
.${C.navLink} svg{transition:transform ${motion.panel}}
.${C.navLink}[aria-expanded=true] svg{transform:rotate(180deg)}
.${C.spacer}{flex:1 1 0;min-width:0}
.${C.iconLink},.${C.iconButton},.${C.menuButton}{${reset}display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:36px;height:36px;border-radius:${radius.pill}px;color:${v('mist')};cursor:pointer;transition:color ${motion.hover},border-color ${motion.hover}}
.${C.iconButton},.${C.menuButton}{border:1px solid ${v('line')}}
.${C.menuButton}{color:${v('text')}}
.${C.iconLink}:hover,.${C.iconButton}:hover{color:${v('text')}}
.${C.iconButton}:hover{border-color:${v('line2')}}
.${C.iconLink}:focus-visible,.${C.iconButton}:focus-visible,.${C.menuButton}:focus-visible{${focus}}
${navMedia.collapsed}{.${C.bar} .${C.iconLink},.${C.bar} .${C.desktopOnly}{display:none}}
${navMedia.expanded}{.${C.bar} .${C.menuButton}{display:none}}
.${C.modeDark},.${C.modeLight}{display:flex}
:root[data-theme=light] .${C.modeDark},:root:not([data-theme=light]) .${C.modeLight}{display:none}
.${C.pill}{display:inline-flex;align-items:center;gap:10px;height:38px;padding:0 18px;border-radius:${radius.pill}px;border:1px solid ${v('line2')};font-family:${font.sans};font-size:${text.ui.size}px;font-weight:${weight.medium};line-height:1;white-space:nowrap;text-decoration:none;color:${v('text')};transition:border-color ${motion.hover},background-color ${motion.hover},transform ${motion.hover}}
.${C.pill}:hover{border-color:${v('lineHover')}}
.${C.pill}:focus-visible{${focus}}
.${C.pillSolid}{background:${v('solidBg')};border-color:${v('solidBg')};color:${v('solidText')}}
.${C.pillSolid}:hover{background:${v('solidHover')};border-color:${v('solidHover')};transform:translateY(-1px)}

@keyframes s-panel-in{from{opacity:0;transform:translateX(-50%) translateY(-4px)}to{opacity:1;transform:translateX(-50%)}}
.${C.panel}{position:absolute;top:62px;left:50%;z-index:${z.panel};max-width:calc(100vw - 32px);max-height:calc(100vh - 100px);overflow-y:auto;padding:20px;border-radius:${radius.panel}px;border:1px solid ${v('line2')};background:${v('panel')};box-shadow:${v('shadow')};transform:translateX(-50%);animation:s-panel-in ${motion.panel} both}
@media (prefers-reduced-motion:reduce){.${C.panel}{animation:none}}
.${C.panelWide}{width:1000px}
.${C.panelNarrow}{width:620px}
.${C.columns4}{display:grid;gap:6px 14px;grid-template-columns:repeat(4,minmax(0,1fr))}
.${C.columns2}{display:grid;gap:6px 14px;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.${C.colTitle}{margin:0 0 6px;padding-left:8px;font-family:${font.mono};font-size:${text.eyebrowTight.size}px;letter-spacing:${text.eyebrowTight.tracking};font-weight:${weight.medium};text-transform:uppercase;color:${v('fog')}}
.${C.list}{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.${C.item}{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:${radius.control}px;text-decoration:none;color:${v('text')}}
.${C.item}:hover,.${C.item}:focus-visible{background:${v('hoverFill')}}
.${C.item}:focus-visible{outline:2px solid ${v('focus')};outline-offset:0}
.${C.item} svg{flex-shrink:0;margin-top:2px}
.${C.itemName}{display:block;font-size:${text.navLink.size}px;font-weight:${weight.medium}}
.${C.itemSub}{display:block;margin-top:1px;font-size:${text.mono.size}px;line-height:1.35;color:${v('fog')}}
.${C.badge}{margin-left:6px;padding:0 6px;border-radius:${radius.pill}px;border:1px solid ${v('warn')};color:${v('warn')};font-family:${font.mono};font-size:9.5px;font-weight:${weight.medium};letter-spacing:.08em;text-transform:uppercase;vertical-align:1px}
.${C.panelFoot}{display:flex;flex-wrap:wrap;gap:20px;list-style:none;margin:14px 0 0;padding:14px 0 0 8px;border-top:1px solid ${v('line')}}
.${C.panelFoot} a{font-size:13px;color:${v('mist')};text-decoration:none;border-radius:4px}
.${C.panelFoot} a:hover{color:${v('text')}}
.${C.panelFoot} a:focus-visible{${focus}}

.${C.sheet}{position:fixed;inset:0;z-index:${z.sheet};pointer-events:auto;overflow-y:auto;overscroll-behavior:contain;padding:${layout.sheetPadTop}px 20px 40px;background:${v('bg')};font-family:${font.sans}}
${navMedia.expanded}{.${C.sheet}{display:none}}
.${C.sheetList}{list-style:none;margin:0;padding:0}
.${C.bigLink}{display:block;padding:12px 0;font-size:${text.sheetLink.size}px;letter-spacing:-.02em;color:${v('text')};text-decoration:none;border-bottom:1px solid ${v('line')}}
.${C.bigLink}:focus-visible{outline:2px solid ${v('focus')};outline-offset:-2px;border-radius:${radius.small}px}
.${C.groupTitle}{margin:26px 0 8px;font-family:${font.mono};font-size:${text.eyebrowTight.size}px;letter-spacing:${text.eyebrowTight.tracking};font-weight:${weight.medium};text-transform:uppercase;color:${v('fog')}}
.${C.sheetGrid}{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.${C.smallLink}{display:block;padding:10px 0;font-size:${text.small.size}px;color:${v('mist')};text-decoration:none;overflow-wrap:anywhere}
.${C.smallLink}[aria-current]{color:${v('text')}}
.${C.smallLink}:focus-visible{${focus};border-radius:${radius.small}px}
.${C.sheetInstall}{margin-top:28px}
.${C.sheetFoot}{display:flex;flex-wrap:wrap;gap:0 20px;list-style:none;margin:20px 0 0;padding:0}

.${C.cmd}{display:flex;align-items:center;gap:14px;height:50px;width:fit-content;max-width:100%;min-width:0;padding:0 8px 0 14px;border-radius:${radius.pill}px;border:1px solid ${v('line2')};background:${v('sheen')};font-family:${font.mono};font-size:12px;color:${v('text')}}
@media (min-width:576px){.${C.cmd}{padding-left:22px;font-size:${text.ui.size}px}}
@media (max-width:575.98px){.${C.cmd}{width:100%}}
.${C.cmdHot}{border-color:${v('hotRing')};box-shadow:${v('hotGlow')}}
.${C.cmdText}{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;color:inherit;background:none;padding:0;border:0}
.${C.cmdPrompt}{color:${v('prompt')};margin-right:8px}
.${C.copy}{${reset}display:inline-flex;align-items:center;flex-shrink:0;height:34px;padding:0 14px;border-radius:${radius.pill}px;background:${v('line')};color:${v('mist')};font-family:${font.mono};font-size:11.5px;cursor:pointer;transition:color ${motion.hover}}
.${C.copy}:hover{color:${v('text')}}
.${C.copy}:focus-visible{${focus}}

.${C.picture}{display:block}
.${C.picture} img{display:block;width:100%;height:auto}
:root[data-theme=light] .${C.onlyDark},:root:not([data-theme=light]) .${C.onlyLight}{display:none}
.${C.svgArt}{display:block;width:100%}
.${C.svgArt} svg{display:block;width:100%;height:auto}
.${C.loop}{position:relative;margin:0}
.${C.loopVideo}{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity ${motion.hover}}
.${C.loopPlaying} .${C.loopVideo}{opacity:1}
.${C.loopToggle}{${reset}position:absolute;right:10px;bottom:10px;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:${radius.pill}px;background:${v('glass')};color:${v('text')};border:1px solid ${v('line2')};cursor:pointer}
.${C.loopToggle}:focus-visible{${focus}}

.${C.counter}{display:block;font-family:${font.sans}}
.${C.counterControls}{display:flex;align-items:center;gap:22px;padding:22px 24px;border-top:1px solid ${v('line')}}
.${C.counterButton}{${reset}display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:${radius.pill}px;border:1px solid ${v('line2')};color:${v('text')};font-size:20px;line-height:1;cursor:pointer;transition:border-color ${motion.hover}}
.${C.counterButton}:hover{border-color:${v('lineHover')}}
.${C.counterButton}:focus-visible{${focus}}
.${C.counterValue}{min-width:2ch;font-size:40px;font-weight:${weight.medium};letter-spacing:-.03em;color:${v('strong')};font-variant-numeric:tabular-nums;text-align:center}
.${C.counterMetrics}{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0;padding:0;list-style:none;border-top:1px solid ${v('line')}}
.${C.counterMetric}{display:flex;flex-direction:column;gap:8px;min-width:0;padding:18px 20px}
.${C.counterMetric}+.${C.counterMetric}{border-left:1px solid ${v('line')}}
.${C.counterLabel}{font-family:${font.mono};font-size:${text.eyebrow.size}px;letter-spacing:${text.eyebrow.tracking};font-weight:${text.eyebrow.weight};text-transform:uppercase;color:${v('fog')};overflow-wrap:anywhere}
.${C.counterNumber}{align-self:flex-start;font-size:26px;font-weight:${weight.medium};color:${v('text')};font-variant-numeric:tabular-nums;border-radius:${radius.small}px}
.${C.counterLive}{color:${v('accent')}}
@keyframes s-pulse-a{from{box-shadow:0 0 0 0 ${pulse.ring}}to{box-shadow:0 0 0 10px ${pulse.fade}}}
@keyframes s-pulse-b{from{box-shadow:0 0 0 0 ${pulse.ring}}to{box-shadow:0 0 0 10px ${pulse.fade}}}
.${C.pulseA}{animation:s-pulse-a ${pulse.duration}ms ${pulse.easing}}
.${C.pulseB}{animation:s-pulse-b ${pulse.duration}ms ${pulse.easing}}
@media (prefers-reduced-motion:reduce){.${C.pulseA},.${C.pulseB}{animation:none;text-decoration:underline 2px ${pulse.edge};text-underline-offset:6px}}
@keyframes s-nf-pulse{0%{filter:drop-shadow(0 0 0 ${pulse.ring})}40%{filter:drop-shadow(0 0 18px ${pulse.ring})}100%{filter:drop-shadow(0 0 0 ${pulse.fade})}}
.${C.nf}{max-width:${layout.maxWidth}px;margin:0 auto;padding:128px ${layout.gutter.xs}px 96px;font-family:${font.sans};color:${v('text')}}
@media (min-width:768px){.${C.nf}{padding:176px ${layout.gutter.md}px 120px}}
.${C.nfCode}{display:block;margin:0;font-size:clamp(96px,22vw,220px);font-weight:${weight.bold};line-height:.86;letter-spacing:-.06em;background:var(--c-ember);-webkit-background-clip:text;background-clip:text;color:transparent;animation:s-nf-pulse 600ms ${pulse.easing} 200ms both}
@media (prefers-reduced-motion:reduce){.${C.nfCode}{animation:none}}
.${C.nfTitle}{margin:28px 0 0;font-family:${font.mono};font-size:${text.eyebrow.size}px;letter-spacing:${text.eyebrow.tracking};font-weight:${text.eyebrow.weight};text-transform:uppercase;color:${v('fog')}}
.${C.nfLede}{max-width:640px;margin:18px 0 0;font-size:${text.ledeHero.size}px;line-height:${text.ledeHero.lineHeight};color:${v('mist')}}
.${C.nfSnippet}{display:inline-block;max-width:100%;margin-top:22px;padding:10px 16px;border-radius:${radius.control}px;border:1px solid ${v('line')};background:${v('well')};font-family:${font.mono};font-size:13px;color:${v('text')};overflow-x:auto;white-space:pre}
.${C.nfArt}{max-width:560px;margin-top:40px}
.${C.nfArt} svg{display:block;width:100%;height:auto}
.${C.nfLinks}{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));list-style:none;margin:48px 0 0;padding:0}
.${C.nfLink}{display:flex;flex-direction:column;gap:6px;height:100%;padding:20px 22px;border-radius:${radius.card}px;border:1px solid ${v('line')};background:${v('card')};color:${v('mist')};text-decoration:none;font-size:${text.small.size}px;line-height:1.5;transition:border-color ${motion.hover}}
.${C.nfLink}:hover{border-color:${v('lineHover')}}
.${C.nfLink}:focus-visible{${focus}}
.${C.nfLinkLabel}{font-size:17px;font-weight:${weight.medium};color:${v('strong')}}
@media (max-width:479.98px){.${C.counterMetric}{padding:14px 12px}.${C.counterLabel}{letter-spacing:.08em}}
}`
