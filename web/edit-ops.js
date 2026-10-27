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
