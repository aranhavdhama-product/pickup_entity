/**
 * Grow merchant portal — now a multi-page app shell (see GrowLayout).
 * Kept as a thin re-export so any lingering `pages/GrowPortal` import resolves
 * to the layout; App.tsx wires the nested routes explicitly.
 */
export { default } from './GrowLayout'
