import { css } from 'lit'

/** Shared bottom-sheet look for shell-owned sheets. */
export const sheetStyles = css`
  .backdrop { position: fixed; inset: 0; background: rgb(15 47 87 / 0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
  .sheet { background: var(--surface); color: var(--text); font-family: var(--font-body); width: 100%; max-width: 560px; max-height: 90vh; overflow: auto; box-sizing: border-box; padding: 20px 16px 28px; border-radius: 20px 20px 0 0; border-top: 1px solid var(--line); }
  h2 { font-family: var(--font-display); font-weight: 600; font-size: 24px; margin: 0 0 12px; }
  h3 { font-size: 15px; font-weight: 700; margin: 20px 0 8px; }
  p { color: var(--muted); margin: 6px 0; line-height: 1.4; }
  button { font: inherit; font-weight: 500; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--text); cursor: pointer; }
  button.primary { background: var(--accent); color: var(--ink); border-color: var(--accent); font-weight: 700; }
  button.danger { background: #C8352E; border-color: #C8352E; color: #fff; font-weight: 700; }
  button[aria-pressed='true'] { background: var(--accent); color: var(--ink); border-color: var(--accent); }
  label { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  input[type='checkbox'] { width: 22px; height: 22px; accent-color: var(--accent); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
`
