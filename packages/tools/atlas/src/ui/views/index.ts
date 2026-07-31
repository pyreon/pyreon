/**
 * The workbench's region views — one folder per region, one component per
 * file. `Workbench.tsx` composes these; the addon panels register through
 * `panels/registerBuiltinPanels`.
 */
export { Sidebar } from './sidebar/Sidebar'
export { TopBar } from './topbar/TopBar'
export { Canvas } from './canvas/Canvas'
export { DocsView } from './docs/DocsView'
export { LabView } from './lab/LabView'
export { AddonPanel } from './panels/AddonPanel'
