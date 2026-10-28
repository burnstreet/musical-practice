// Pure editor operations; `selected` is a Set of note indices.
export function setRole(notes, selected, role) {
  selected.forEach((i) => {
    notes[i].role = role
  })
}

export function togglePhraseStart(notes, selected) {
  selected.forEach((i) => {
    if (notes[i].phraseStart) delete notes[i].phraseStart
    else notes[i].phraseStart = true
  })
}

// Section ops return a new sorted list or throw an Error the editor shows.
// grid = {bars: bar start seconds, end: song end}; bar numbers are 1-based and inclusive.
function place(sections, grid, skip, name, from, to) {
  const n = grid.bars.length
  if (!(from >= 1 && to >= from && to <= n)) throw new Error(`Takte ${from}–${to}: erwartet 1 ≤ von ≤ bis ≤ ${n}`)
  const s = { name, start: grid.bars[from - 1], end: to < n ? grid.bars[to] : grid.end }
  const others = sections.filter((_, i) => i !== skip)
  const hit = others.find((o) => s.start < o.end && o.start < s.end)
  if (hit) throw new Error(`Takte ${from}–${to} überschneiden „${hit.name}“`)
  return [...others, s].sort((a, b) => a.start - b.start)
}

export const addSection = (sections, grid, name, from, to) => place(sections, grid, -1, name, from, to)

export const rebarSection = (sections, grid, i, from, to) => place(sections, grid, i, sections[i].name, from, to)

export const renameSection = (sections, i, name) => sections.map((s, k) => (k === i ? { ...s, name } : s))

export const deleteSection = (sections, i) => sections.filter((_, k) => k !== i)

// detect() asks the builder (editor server); runs only after confirm().
export async function redetectSections(sections, confirm, detect) {
  return confirm() ? await detect() : sections
}
