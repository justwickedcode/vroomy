// Livery patterns layered over the base paint color (see CarIcon's LiveryOverlay) — the
// "Themes" nav destination. 'solid' is the default, pre-existing look (just the paint color,
// no pattern), so profiles saved before this existed fall back to it with zero visual change.
export type LiveryId =
  | 'solid'
  | 'stripes'
  | 'checkered'
  | 'camo'
  | 'carbon'
  | 'fade'

export const LIVERIES: Array<{ id: LiveryId; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'stripes', label: 'Racing stripes' },
  { id: 'checkered', label: 'Checkered' },
  { id: 'camo', label: 'Camo' },
  { id: 'carbon', label: 'Carbon fiber' },
  { id: 'fade', label: 'Fade' },
]
