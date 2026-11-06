import { html, svg } from 'lit'

/** A 24×24 artboard icon at `size` px, hidden from screen readers. */
export const icon = (body: ReturnType<typeof svg>, size = 22) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`

/** Icon shapes from the artboards that more than one screen uses; each screen picks the size with `icon`. */
export const shapes = {
  back: svg`<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  sliders: svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></g>`,
  toStart: svg`<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 5v14L9 12z"/><path d="M5 5v14" stroke-linecap="round"/></g>`,
  pause: svg`<g fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></g>`,
  play: svg`<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>`,
  /** The smaller triangle on resume and song buttons. */
  go: svg`<path d="M7 4l13 8-13 8z" fill="currentColor"/>`,
  mic: svg`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></g>`,
}
