// Pure script operations: take a script {scenes: [{id, title, items}]}, return a new one or throw a ScriptOpError the editor shows.
export class ScriptOpError extends Error {}

const fail = (msg) => {
  throw new ScriptOpError(msg)
}

// copy of the script plus the scene and index of item `id`
function locate(s, id) {
  const next = structuredClone(s)
  for (const scene of next.scenes) {
    const i = scene.items.findIndex((it) => it.id === id)
    if (i >= 0) return { next, items: scene.items, i, item: scene.items[i] }
  }
  return fail(`Eintrag „${id}“ nicht gefunden`)
}

const needLine = (item) => item.type === 'line' || fail('Nur Sprechzeilen haben diese Eigenschaft')

function newId(s) {
  const used = new Set(s.scenes.flatMap((sc) => sc.items.map((it) => it.id)))
  for (;;) {
    const id = Array.from({ length: 4 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
    if (!used.has(id)) return id
  }
}

export function setText(s, id, text) {
  const { next, item } = locate(s, id)
  if (item.type === 'song') fail('Lied-Einträge haben keinen Text')
  if (!text.trim()) fail('Der Text darf nicht leer sein')
  item.text = text
  return next
}

export function setSay(s, id, say) {
  const { next, item } = locate(s, id)
  needLine(item)
  if (say) item.say = say
  else delete item.say
  return next
}

export function setRole(s, id, role) {
  const { next, item } = locate(s, id)
  needLine(item)
  item.role = role
  return next
}

export function setType(s, id, type, role) {
  const { next, item } = locate(s, id)
  if (item.type === 'song') fail('Lied-Einträge lassen sich nicht umwandeln')
  if (type === 'line') {
    if (!role) fail('Für eine Sprechzeile fehlt die Rolle')
    item.role = role
  } else {
    delete item.role
    delete item.say
  }
  item.type = type
  return next
}

export function split(s, id, offset) {
  const { next, items, i, item } = locate(s, id)
  if (item.type === 'song') fail('Lied-Einträge lassen sich nicht teilen')
  const a = item.text.slice(0, offset).trim(),
    b = item.text.slice(offset).trim()
  if (!a || !b) fail('Teilen nicht möglich: vor und nach dem Cursor muss Text stehen')
  const second = { ...item, id: newId(s), text: b }
  delete second.say
  delete item.say
  item.text = a
  items.splice(i + 1, 0, second)
  return next
}

export function merge(s, id) {
  const { next, items, i, item } = locate(s, id)
  const other = items[i + 1]
  if (!other) fail('Kein nächster Eintrag in dieser Szene')
  const same = item.type === other.type && (item.type === 'direction' || (item.type === 'line' && item.role === other.role))
  if (!same) fail('Zusammenführen nur bei zwei Zeilen derselben Rolle oder zwei Regieanweisungen')
  item.text = `${item.text} ${other.text}`
  delete item.say
  items.splice(i + 1, 1)
  return next
}

export function insertAfter(s, id, item) {
  const { next, items, i } = locate(s, id)
  items.splice(i + 1, 0, { ...item, id: newId(s) })
  return next
}

export function remove(s, id) {
  const { next, items, i } = locate(s, id)
  items.splice(i, 1)
  return next
}
