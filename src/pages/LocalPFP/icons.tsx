/**
 * EXTRACTED ICONS — verbatim from staging `/v2/ses/pending-for-planning`.
 *
 * Every glyph below was read out of the live staging DOM (`svg.outerHTML`,
 * deduped by geometry) on 2026-09-18 from tab 200074091 at 1440x900. The
 * `viewBox`, the path/line/polyline geometry and the stroke widths are
 * REPRODUCED AS FOUND — do not "tidy" them, and do not hand-edit them: re-run
 * the extraction instead (see `scratchpad/split/pixel-diff-log.md`).
 *
 * Provenance of the three families staging mixes, recorded so a future fix has a
 * named faithful substitute rather than a guess:
 *   • `viewBox="0 0 256 256"`        — Phosphor Icons (regular, stroke 16)
 *   • `viewBox="64 64 896 896"` / `"0 0 1024 1024"` — Ant Design icons (filled)
 *   • everything else               — FarEye's own SVGs
 *
 * THIS TREE USES NO EXTERNAL ICON PACKAGE. The replica route is a pixel replica;
 * a lucide glyph is a different drawing at a different stroke weight and would
 * show up as a permanent residual in the icon bands of the diff.
 *
 * Colour: every icon takes its colour from `currentColor` where staging did, and
 * carries staging's literal hex where staging hard-coded one (those are noted).
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

/** Phosphor's bounding rect — present in every 256-box glyph staging renders. */
const PHOSPHOR_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 16,
} as const

function Svg({ size = 16, viewBox, children, ...rest }: P & { viewBox: string }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

/* ------------------------------------------------- Ant Design (filled) ----- */

/** date-range separator (`data-icon="swap-right"`) */
export function SwapRight({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 1024 1024" {...rest}>
      <path fill="currentColor" d="M873.1 596.2l-164-208A32 32 0 00684 376h-64.8c-6.7 0-10.4 7.7-6.3 13l144.3 183H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h695.9c26.8 0 41.7-30.8 25.2-51.8z" />
    </Svg>
  )
}

/** the date-picker suffix (`data-icon="calendar"`) */
export function Calendar({ size = 14, ...rest }: P) {
  return (
    <Svg size={size} viewBox="64 64 896 896" {...rest}>
      <path fill="currentColor" d="M880 184H712v-64c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v64H384v-64c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v64H144c-17.7 0-32 14.3-32 32v664c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V216c0-17.7-14.3-32-32-32zm-40 656H184V460h656v380zM184 392V256h128v48c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-48h256v48c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-48h128v136H184z" />
    </Svg>
  )
}

/** the clear (✕) affordance inside a filled select (`data-icon="close-circle"`) */
export function CloseCircle({ size = 12, ...rest }: P) {
  return (
    <Svg size={size} viewBox="64 64 896 896" {...rest}>
      <path fill="currentColor" d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 01-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z" />
    </Svg>
  )
}

/** column sort — the UP half (`data-icon="caret-up"`), 12px in the header */
export function CaretUpSolid({ size = 12, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 1024 1024" {...rest}>
      <path fill="currentColor" d="M858.9 689L530.5 308.2c-9.4-10.9-27.5-10.9-37 0L165.1 689c-12.2 14.2-1.2 35 18.5 35h656.8c19.7 0 30.7-20.8 18.5-35z" />
    </Svg>
  )
}

/** column sort — the DOWN half (`data-icon="caret-down"`) */
export function CaretDownSolid({ size = 12, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 1024 1024" {...rest}>
      <path fill="currentColor" d="M840.4 300H183.6c-19.7 0-30.7 20.8-18.5 35l328.4 380.8c9.4 10.9 27.5 10.9 37 0L858.9 335c12.2-14.2 1.2-35-18.5-35z" />
    </Svg>
  )
}

/** number-input spinner, up (`data-icon="up"`) — 7px in the Service Time cell */
export function StepUp({ size = 7, ...rest }: P) {
  return (
    <Svg size={size} viewBox="64 64 896 896" {...rest}>
      <path fill="currentColor" d="M890.5 755.3L537.9 269.2c-12.8-17.6-39-17.6-51.7 0L133.5 755.3A8 8 0 00140 768h75c5.1 0 9.9-2.5 12.9-6.6L512 369.8l284.1 391.6c3 4.1 7.8 6.6 12.9 6.6h75c6.5 0 10.3-7.4 6.5-12.7z" />
    </Svg>
  )
}

/** number-input spinner, down (`data-icon="down"`) */
export function StepDown({ size = 7, ...rest }: P) {
  return (
    <Svg size={size} viewBox="64 64 896 896" {...rest}>
      <path fill="currentColor" d="M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5 12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z" />
    </Svg>
  )
}

/* ------------------------------------------------------------ Phosphor ---- */

/** select chevron — staging hard-codes `color="#5C708A"` */
export function CaretDown({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <polyline points="208 96 128 176 48 96" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** the advanced-filter funnel — three lines, NOT a filled funnel */
export function Funnel({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="64" y1="128" x2="192" y2="128" {...PHOSPHOR_STROKE} />
      <line x1="24" y1="80" x2="232" y2="80" {...PHOSPHOR_STROKE} />
      <line x1="104" y1="176" x2="152" y2="176" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** Quick Filter's leading glyph — staging hard-codes `color="#C72820"` */
export function WarningCircle({ size = 24, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="16" />
      <line x1="128" y1="136" x2="128" y2="80" {...PHOSPHOR_STROKE} />
      <circle cx="128" cy="172" r="12" fill="currentColor" />
    </Svg>
  )
}

/** the Exceptions select's glyph — a warning TRIANGLE, `color="#C72820"` */
export function WarningTriangle({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M142.41,40.22l87.46,151.87C236,202.79,228.08,216,215.46,216H40.54C27.92,216,20,202.79,26.13,192.09L113.59,40.22C119.89,29.26,136.11,29.26,142.41,40.22Z" {...PHOSPHOR_STROKE} />
      <line x1="128" y1="144" x2="128" y2="104" {...PHOSPHOR_STROKE} />
      <circle cx="128" cy="180" r="12" fill="currentColor" />
    </Svg>
  )
}

/** Categories chip: VIP — staging hard-codes `color="#8C750C"` */
export function Star({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M135.34,28.9l23.23,55.36a8,8,0,0,0,6.67,4.88l59.46,5.14a8,8,0,0,1,4.54,14.07L184.13,147.7a8.08,8.08,0,0,0-2.54,7.89l13.52,58.54a8,8,0,0,1-11.89,8.69l-51.1-31a7.93,7.93,0,0,0-8.24,0l-51.1,31a8,8,0,0,1-11.89-8.69l13.52-58.54a8.08,8.08,0,0,0-2.54-7.89L26.76,108.35A8,8,0,0,1,31.3,94.28l59.46-5.14a8,8,0,0,0,6.67-4.88L120.66,28.9A8,8,0,0,1,135.34,28.9Z" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** Categories chip: Stackable — `color="#1656A1"` */
export function Stack({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <polyline points="32 176 128 232 224 176" {...PHOSPHOR_STROKE} />
      <polyline points="32 128 128 184 224 128" {...PHOSPHOR_STROKE} />
      <polygon points="32 80 128 136 224 80 128 24 32 80" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** Categories chip: Hazmat — the one FILLED Phosphor glyph, `color="#C72820"` */
export function Biohazard({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <path fill="currentColor" d="M185.68,104.28q-1.4-2.88-3.06-5.6a60,60,0,0,0-26.92-78,8,8,0,0,0-7.4,14.19A44,44,0,0,1,170.72,84.4a63.85,63.85,0,0,0-85.46,0A44,44,0,0,1,107.7,34.87a8,8,0,1,0-7.4-14.19,60,60,0,0,0-26.93,78,62.59,62.59,0,0,0-3.05,5.58A60.07,60.07,0,0,0,16,164a8,8,0,0,0,16,0,44.09,44.09,0,0,1,32.89-42.58A63.94,63.94,0,0,0,109,193.11a44,44,0,0,1-56.65,8,8,8,0,1,0-8.62,13.47A60,60,0,0,0,126.74,196l1.26,0,1.26,0a60,60,0,0,0,83.05,18.59,8,8,0,1,0-8.62-13.47,44,44,0,0,1-56.65-8,63.94,63.94,0,0,0,44.07-71.69A44.09,44.09,0,0,1,224,164a8,8,0,0,0,16,0A60.07,60.07,0,0,0,185.68,104.28ZM128,84a47.91,47.91,0,0,1,35.56,15.79,44,44,0,0,1-71.13,0A47.89,47.89,0,0,1,128,84Zm.12,49.92-.12.2-.12-.2h.24ZM80,132a47.6,47.6,0,0,1,1.44-11.65,44,44,0,0,1,36,58.46A48.07,48.07,0,0,1,80,132Zm58.57,46.81a44,44,0,0,1,36-58.46,48,48,0,0,1-36,58.46Z" />
    </Svg>
  )
}

/** Categories chip: Heavy Weight — a barbell, `color="#0A8037"` */
export function Barbell({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <rect x="56" y="56" width="40" height="144" rx="8" {...PHOSPHOR_STROKE} />
      <rect x="160" y="56" width="40" height="144" rx="8" {...PHOSPHOR_STROKE} />
      <path d="M200,80h24a8,8,0,0,1,8,8v80a8,8,0,0,1-8,8H200" {...PHOSPHOR_STROKE} />
      <path d="M56,176H32a8,8,0,0,1-8-8V88a8,8,0,0,1,8-8H56" {...PHOSPHOR_STROKE} />
      <line x1="96" y1="128" x2="160" y2="128" {...PHOSPHOR_STROKE} />
      <line x1="232" y1="128" x2="248" y2="128" {...PHOSPHOR_STROKE} />
      <line x1="8" y1="128" x2="24" y2="128" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** the per-column search glyph in a table header — `color="#4C5761"` */
export function MagnifyingGlass({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="112" cy="112" r="80" {...PHOSPHOR_STROKE} />
      <line x1="168.57" y1="168.57" x2="224" y2="224" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** the arrow that prefixes a FORWARD order number — `color="#5C708A"` */
export function ArrowRight({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="40" y1="128" x2="216" y2="128" {...PHOSPHOR_STROKE} />
      <polyline points="144 56 216 128 144 200" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** the edit affordance beside an inline Weight / Volume input — `color="#202C39"` */
export function NotePencil({ size = 14, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <polygon points="128 160 96 160 96 128 192 32 224 64 128 160" {...PHOSPHOR_STROKE} />
      <line x1="168" y1="56" x2="200" y2="88" {...PHOSPHOR_STROKE} />
      <path d="M216,120v88a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8h88" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** the SKU peek affordance — `color="#202C39"` */
export function Eye({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z" {...PHOSPHOR_STROKE} />
      <circle cx="128" cy="128" r="40" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/* -------------------------------------------------------- FarEye's own ---- */

/** the list toolbar's search box glyph (24-box, stroke 1, `#4C5761`) */
export function SearchGlyph({ size = 24, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 24 24" {...rest}>
      <path d="M11.4375 15.375C13.6121 15.375 15.375 13.6121 15.375 11.4375C15.375 9.26288 13.6121 7.5 11.4375 7.5C9.26288 7.5 7.5 9.26288 7.5 11.4375C7.5 13.6121 9.26288 15.375 11.4375 15.375Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.2219 14.2219L16.5 16.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** the CSV download icon button (`#5C708A`) */
export function Download({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 16 16" {...rest}>
      <path d="M2.66666 8.48047V11.0005C2.66666 11.5528 3.11437 12.0005 3.66666 12.0005H12.3333C12.8856 12.0005 13.3333 11.5528 13.3333 11.0005V8.48047" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.66666 7.52L7.99999 9.76M7.99999 9.76L10.3333 7.52M7.99999 9.76V4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * the table-settings icon button — a table with a gear on its corner.
 * 22x16, so it is the one glyph whose box is NOT square.
 */
export function TableEdit({ size = 16, ...rest }: P & { size?: number }) {
  return (
    <svg width={(size * 22) / 16} height={size} viewBox="0 0 22 16" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...rest}>
      <path d="M4.95691 8V12.5" stroke="#202C39" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.91385 8V12.5" stroke="#202C39" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.8385 3.5V3.5C15.8385 2.67157 15.1669 2 14.3385 2H3C1.89543 2 1 2.89543 1 4V6M12 15H3C1.89543 15 1 14.1046 1 13V6M1 6H11.5" stroke="#5C708A" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.3349 7.61352C19.4506 7.78742 19.5519 7.97141 19.6376 8.16347L20.8822 8.89001C21.0376 9.62082 21.0393 10.3784 20.887 11.11L19.6376 11.8365C19.5519 12.0286 19.4506 12.2126 19.3349 12.3865L19.3589 13.885C18.8315 14.3896 18.2072 14.7698 17.5281 15L16.3027 14.2281C16.1012 14.2432 15.8988 14.2432 15.6973 14.2281L14.4767 14.995C13.7955 14.769 13.1691 14.3902 12.6411 13.885L12.6651 12.3915C12.5504 12.2152 12.4492 12.0296 12.3624 11.8365L11.1178 11.11C10.9624 10.3792 10.9607 9.62156 11.113 8.89001L12.3624 8.16347C12.4481 7.97141 12.5494 7.78742 12.6651 7.61352L12.6411 6.11504C13.1685 5.61038 13.7928 5.23017 14.4719 5L15.6973 5.77195C15.8988 5.75681 16.1012 5.75681 16.3027 5.77195L17.5233 5.00505C18.2045 5.23103 18.8309 5.60976 19.3589 6.11504L19.3349 7.61352Z" stroke="#5C708A" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12C17.1046 12 18 11.1046 18 10C18 8.89543 17.1046 8 16 8C14.8954 8 14 8.89543 14 10C14 11.1046 14.8954 12 16 12Z" stroke="#5C708A" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** the flags column's header glyph — three bullet rows (`#4C5761`) */
export function ListGlyph({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 20 20" {...rest}>
      <path fill="currentColor" d="M6 5C6 4.82319 6.07024 4.65362 6.19526 4.5286C6.32029 4.40357 6.48986 4.33333 6.66667 4.33333H17.3333C17.5101 4.33333 17.6797 4.40357 17.8047 4.5286C17.9298 4.65362 18 4.82319 18 5C18 5.17681 17.9298 5.34638 17.8047 5.4714C17.6797 5.59643 17.5101 5.66667 17.3333 5.66667H6.66667C6.48986 5.66667 6.32029 5.59643 6.19526 5.4714C6.07024 5.34638 6 5.17681 6 5ZM17.3333 9.66667H6.66667C6.48986 9.66667 6.32029 9.73691 6.19526 9.86193C6.07024 9.98695 6 10.1565 6 10.3333C6 10.5101 6.07024 10.6797 6.19526 10.8047C6.32029 10.9298 6.48986 11 6.66667 11H17.3333C17.5101 11 17.6797 10.9298 17.8047 10.8047C17.9298 10.6797 18 10.5101 18 10.3333C18 10.1565 17.9298 9.98695 17.8047 9.86193C17.6797 9.73691 17.5101 9.66667 17.3333 9.66667ZM17.3333 15H6.66667C6.48986 15 6.32029 15.0702 6.19526 15.1953C6.07024 15.3203 6 15.4899 6 15.6667C6 15.8435 6.07024 16.013 6.19526 16.1381C6.32029 16.2631 6.48986 16.3333 6.66667 16.3333H17.3333C17.5101 16.3333 17.6797 16.2631 17.8047 16.1381C17.9298 16.013 18 15.8435 18 15.6667C18 15.4899 17.9298 15.3203 17.8047 15.1953C17.6797 15.0702 17.5101 15 17.3333 15ZM3 4C2.80222 4 2.60888 4.05865 2.44443 4.16853C2.27998 4.27841 2.15181 4.43459 2.07612 4.61732C2.00043 4.80004 1.98063 5.00111 2.01922 5.19509C2.0578 5.38907 2.15304 5.56725 2.29289 5.70711C2.43275 5.84696 2.61093 5.9422 2.80491 5.98079C2.99889 6.01937 3.19996 5.99957 3.38268 5.92388C3.56541 5.84819 3.72159 5.72002 3.83147 5.55557C3.94135 5.39112 4 5.19778 4 5C4 4.73478 3.89464 4.48043 3.70711 4.29289C3.51957 4.10536 3.26522 4 3 4ZM3 9.33333C2.80222 9.33333 2.60888 9.39198 2.44443 9.50186C2.27998 9.61174 2.15181 9.76792 2.07612 9.95065C2.00043 10.1334 1.98063 10.3344 2.01922 10.5284C2.0578 10.7224 2.15304 10.9006 2.29289 11.0404C2.43275 11.1803 2.61093 11.2755 2.80491 11.3141C2.99889 11.3527 3.19996 11.3329 3.38268 11.2572C3.56541 11.1815 3.72159 11.0534 3.83147 10.8889C3.94135 10.7245 4 10.5311 4 10.3333C4 10.0681 3.89464 9.81376 3.70711 9.62623C3.51957 9.43869 3.26522 9.33333 3 9.33333ZM3 14.6667C2.80222 14.6667 2.60888 14.7253 2.44443 14.8352C2.27998 14.9451 2.15181 15.1013 2.07612 15.284C2.00043 15.4667 1.98063 15.6678 2.01922 15.8618C2.0578 16.0557 2.15304 16.2339 2.29289 16.3738C2.43275 16.5136 2.61093 16.6089 2.80491 16.6475C2.99889 16.686 3.19996 16.6662 3.38268 16.5905C3.56541 16.5149 3.72159 16.3867 3.83147 16.2222C3.94135 16.0578 4 15.8644 4 15.6667C4 15.4015 3.89464 15.1471 3.70711 14.9596C3.51957 14.772 3.26522 14.6667 3 14.6667Z" />
    </Svg>
  )
}

/**
 * Categories chip: Fragile — a wine glass. The only glyph staging draws with a
 * mixed `fill` (the outer `fill="#4A6365"` is overridden by the path's own
 * `fill="#202C39"`), so it is reproduced with the literal fill rather than
 * `currentColor`.
 */
export function WineGlass({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 24 24" {...rest}>
      <path fillRule="evenodd" clipRule="evenodd" fill="#202C39" d="M6.43373 1.84069C6.50777 1.52402 6.79014 1.30005 7.11535 1.30005H10.497C10.7057 1.30005 10.9035 1.39316 11.0365 1.55399C11.1695 1.71482 11.2238 1.92659 11.1846 2.13157L10.5921 5.22862H11.7333C11.9518 5.22862 12.1578 5.33068 12.2902 5.50453C12.4226 5.67839 12.4662 5.9041 12.4081 6.11476L12.0386 7.4543L14.0065 4.48576H12.3757C12.1648 4.48576 11.9651 4.39064 11.8322 4.22684C11.6993 4.06305 11.6473 3.84805 11.6907 3.64163L12.0665 1.85591C12.1347 1.53196 12.4204 1.30005 12.7515 1.30005H16.8847C17.2027 1.30005 17.4807 1.51443 17.5616 1.82199C17.8108 2.76938 18.5359 5.45485 19.4362 8.5927C20.654 12.8369 17.576 16.9556 12.7 17.3172V21.3H14.9948C15.3814 21.3 15.6948 21.6135 15.6948 22C15.6948 22.3866 15.3814 22.7001 14.9948 22.7001H9.20833C8.82173 22.7001 8.50833 22.3866 8.50833 22C8.50833 21.6135 8.82173 21.3 9.20833 21.3H11.3V17.3151C6.4156 16.9243 3.33638 12.4807 4.5691 8.57507C5.46452 5.7381 6.18642 2.8985 6.43373 1.84069ZM7.66697 2.70005C7.34017 4.03032 6.6882 6.51241 5.90418 8.99645C4.94035 12.0502 7.5163 15.9429 12 15.9429C16.4925 15.9429 19.0699 12.3921 18.0905 8.97882C17.3182 6.28724 16.6742 3.92639 16.3463 2.70005H13.3195L13.2384 3.08576H15.3104C15.5682 3.08576 15.8052 3.2275 15.9271 3.45466C16.0491 3.68183 16.0363 3.95764 15.8938 4.17254L10.7799 11.8868C10.5898 12.1795 10.2797 12.1371 9.90636 12.1371C9.59325 11.9945 9.43016 11.6456 9.52165 11.3139L10.8141 6.62862H9.74555C9.53686 6.62862 9.33906 6.53551 9.20608 6.37468C9.0731 6.21385 9.01881 6.00207 9.05802 5.7971L9.65044 2.70005H7.66697Z" />
    </Svg>
  )
}

/** footer pager — previous page */
export function ChevronLeft({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 20 20" {...rest}>
      <path fill="currentColor" d="M12.425 5.59168C12.1 5.26668 11.575 5.26668 11.25 5.59168L7.42502 9.41668C7.10002 9.74168 7.10002 10.2667 7.42502 10.5917L11.25 14.4167C11.575 14.7417 12.1 14.7417 12.425 14.4167C12.75 14.0917 12.75 13.5667 12.425 13.2417L9.19169 10L12.425 6.76668C12.7417 6.44168 12.7417 5.90835 12.425 5.59168Z" />
    </Svg>
  )
}

/** footer pager — next page */
export function ChevronRight({ size = 20, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 20 20" {...rest}>
      <path fill="currentColor" d="M7.75834 5.59166C7.43334 5.91666 7.43334 6.44166 7.75834 6.76666L10.9917 10L7.75834 13.2333C7.43334 13.5583 7.43334 14.0833 7.75834 14.4083C8.08334 14.7333 8.60834 14.7333 8.93334 14.4083L12.7583 10.5833C13.0833 10.2583 13.0833 9.73333 12.7583 9.40833L8.93334 5.58333C8.61667 5.26666 8.08334 5.26666 7.75834 5.59166Z" />
    </Svg>
  )
}

/** the footer Refresh button's glyph — staging hard-codes `#B7BCC0` */
export function Refresh({ size = 22, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 16 16" {...rest}>
      <path d="M10.3945 6.23991H12.9997V3.63477" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.1547 11.1519C10.4869 11.8203 9.63588 12.2755 8.7093 12.4601C7.78272 12.6447 6.82221 12.5504 5.94927 12.189C5.07632 11.8276 4.33017 11.2155 3.80519 10.43C3.28021 9.64446 3 8.72089 3 7.7761C3 6.83131 3.28021 5.90775 3.80519 5.12224C4.33017 4.33673 5.07632 3.72457 5.94927 3.36319C6.82221 3.00181 7.78272 2.90746 8.7093 3.09206C9.63588 3.27666 10.4869 3.73193 11.1547 4.40027L13 6.24015" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/* ------------------------------------------------- selection-panel icons -- */
/*
 * The eight bulk-action glyphs and the overlay rail's nine tab glyphs are NOT in
 * the list page's DOM — they mount with their popover — so they were not part of
 * this dump. The panel reuses the glyphs above where staging does (clock →
 * `WarningCircle` is NOT one of them); anything still missing is listed as a
 * named approximation in `scratchpad/split/pixel-diff-log.md`.
 */

/** clock — Schedule. Phosphor Clock, redrawn from the family's own geometry. */
export function Clock({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="128" cy="128" r="96" {...PHOSPHOR_STROKE} />
      <polyline points="128 72 128 128 184 128" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** arrow-u-left — Initiate Return to Origin. */
export function ArrowUturnLeft({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <polyline points="80 136 32 88 80 40" {...PHOSPHOR_STROKE} />
      <path d="M32,88h96a80,80,0,0,1,80,80v48" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** path — Plan For Routing. */
export function RoutePath({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="60" cy="60" r="28" {...PHOSPHOR_STROKE} />
      <circle cx="196" cy="196" r="28" {...PHOSPHOR_STROKE} />
      <path d="M88,60h60a40,40,0,0,1,0,80H108a40,40,0,0,0,0,80h60" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** calendar-check — Mark Ready for Planning. */
export function CalendarCheck({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <rect x="40" y="40" width="176" height="176" rx="8" {...PHOSPHOR_STROKE} />
      <line x1="176" y1="24" x2="176" y2="56" {...PHOSPHOR_STROKE} />
      <line x1="80" y1="24" x2="80" y2="56" {...PHOSPHOR_STROKE} />
      <line x1="40" y1="88" x2="216" y2="88" {...PHOSPHOR_STROKE} />
      <polyline points="92 148 116 172 164 124" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** list-checks — Close Consignment. */
export function ListChecks({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="104" y1="64" x2="216" y2="64" {...PHOSPHOR_STROKE} />
      <line x1="104" y1="128" x2="216" y2="128" {...PHOSPHOR_STROKE} />
      <line x1="104" y1="192" x2="216" y2="192" {...PHOSPHOR_STROKE} />
      <polyline points="40 60 52 72 76 48" {...PHOSPHOR_STROKE} />
      <polyline points="40 124 52 136 76 112" {...PHOSPHOR_STROKE} />
      <polyline points="40 188 52 200 76 176" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** trash — Cancel Order (the one red action). */
export function Trash({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="216" y1="60" x2="40" y2="60" {...PHOSPHOR_STROKE} />
      <line x1="88" y1="20" x2="168" y2="20" {...PHOSPHOR_STROKE} />
      <path d="M200,60V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V60" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** ✕ — closes the selection panel, the popups and the detail overlay. */
export function Close({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="200" y1="56" x2="56" y2="200" {...PHOSPHOR_STROKE} />
      <line x1="200" y1="200" x2="56" y2="56" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/** ← — the detail overlay's back arrow. */
export function ArrowLeft({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="216" y1="128" x2="40" y2="128" {...PHOSPHOR_STROKE} />
      <polyline points="112 56 40 128 112 200" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

/* ------------------------------------------------- app-side glyphs -------- */
/*
 * NAMED APPROXIMATIONS, and labelled as such.
 *
 * These are not in staging's Pending For Planning DOM — they belong to this
 * app's own surfaces inside the same tree: the detail overlay's rail, the two
 * direction arrows in `cells.tsx`, and the column-configuration page. They are
 * drawn in the SAME Phosphor geometry (256 box, stroke 16, round caps) as the
 * extracted glyphs so the tree reads as one icon set and no
 * external icon package is imported anywhere under it.
 */

export function ClipboardList({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M88,40H56a8,8,0,0,0-8,8V208a8,8,0,0,0,8,8H200a8,8,0,0,0,8-8V48a8,8,0,0,0-8-8H168" {...PHOSPHOR_STROKE} />
      <rect x="88" y="24" width="80" height="32" rx="8" {...PHOSPHOR_STROKE} />
      <line x1="88" y1="120" x2="168" y2="120" {...PHOSPHOR_STROKE} />
      <line x1="88" y1="160" x2="168" y2="160" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function Package({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M32,80l96,48,96-48L128,32Z" {...PHOSPHOR_STROKE} />
      <path d="M32,80v96l96,48V128" {...PHOSPHOR_STROKE} />
      <path d="M224,80v96l-96,48" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function GridFour({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <rect x="40" y="40" width="72" height="72" rx="8" {...PHOSPHOR_STROKE} />
      <rect x="144" y="40" width="72" height="72" rx="8" {...PHOSPHOR_STROKE} />
      <rect x="40" y="144" width="72" height="72" rx="8" {...PHOSPHOR_STROKE} />
      <rect x="144" y="144" width="72" height="72" rx="8" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function MapPin({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="128" cy="104" r="32" {...PHOSPHOR_STROKE} />
      <path d="M208,104c0,72-80,128-80,128S48,176,48,104a80,80,0,0,1,160,0Z" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function ListTree({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="112" y1="64" x2="216" y2="64" {...PHOSPHOR_STROKE} />
      <line x1="144" y1="128" x2="216" y2="128" {...PHOSPHOR_STROKE} />
      <line x1="144" y1="192" x2="216" y2="192" {...PHOSPHOR_STROKE} />
      <path d="M64,48v128a16,16,0,0,0,16,16h32" {...PHOSPHOR_STROKE} />
      <line x1="64" y1="128" x2="112" y2="128" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function Wrench({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M216,80a48,48,0,0,1-65.6,44.6L72,203a24,24,0,0,1-34-34l78.4-78.4A48,48,0,0,1,183,48l-31,31,26,26,31-31A47.8,47.8,0,0,1,216,80Z" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function FileImage({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M200,224H56a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h96l56,56V216A8,8,0,0,1,200,224Z" {...PHOSPHOR_STROKE} />
      <polyline points="152 32 152 88 208 88" {...PHOSPHOR_STROKE} />
      <circle cx="96" cy="144" r="16" {...PHOSPHOR_STROKE} />
      <polyline points="80 192 120 160 168 192" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function ChatText({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M45.4,177A95.9,95.9,0,1,1,79,210.6L45.8,220a8,8,0,0,1-9.8-9.8Z" {...PHOSPHOR_STROKE} />
      <line x1="96" y1="112" x2="160" y2="112" {...PHOSPHOR_STROKE} />
      <line x1="96" y1="144" x2="160" y2="144" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function Send({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="144" y1="128" x2="80" y2="128" {...PHOSPHOR_STROKE} />
      <path d="M48.5,55.6l175,64.3a8,8,0,0,1,0,15l-175,64.3a8,8,0,0,1-10.5-9.5L64,128,38,65.1A8,8,0,0,1,48.5,55.6Z" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function ArrowUpRight({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="64" y1="192" x2="192" y2="64" {...PHOSPHOR_STROKE} />
      <polyline points="88 64 192 64 192 168" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function ArrowDownLeft({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <line x1="192" y1="64" x2="64" y2="192" {...PHOSPHOR_STROKE} />
      <polyline points="168 192 64 192 64 88" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function GripVertical({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <circle cx="96" cy="64" r="14" fill="currentColor" />
      <circle cx="96" cy="128" r="14" fill="currentColor" />
      <circle cx="96" cy="192" r="14" fill="currentColor" />
      <circle cx="160" cy="64" r="14" fill="currentColor" />
      <circle cx="160" cy="128" r="14" fill="currentColor" />
      <circle cx="160" cy="192" r="14" fill="currentColor" />
    </Svg>
  )
}

export function Lock({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <rect x="40" y="88" width="176" height="128" rx="8" {...PHOSPHOR_STROKE} />
      <path d="M92,88V52a36,36,0,0,1,72,0V88" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}

export function Sparkles({ size = 16, ...rest }: P) {
  return (
    <Svg size={size} viewBox="0 0 256 256" {...rest}>
      <rect width="256" height="256" fill="none" />
      <path d="M96,32l16,48,48,16-48,16L96,160,80,112,32,96,80,80Z" {...PHOSPHOR_STROKE} />
      <line x1="184" y1="24" x2="184" y2="72" {...PHOSPHOR_STROKE} />
      <line x1="208" y1="48" x2="160" y2="48" {...PHOSPHOR_STROKE} />
      <line x1="184" y1="168" x2="184" y2="216" {...PHOSPHOR_STROKE} />
      <line x1="208" y1="192" x2="160" y2="192" {...PHOSPHOR_STROKE} />
    </Svg>
  )
}
