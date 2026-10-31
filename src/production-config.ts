/** What a production (content repo) sets in its production.json. Read by vite.config.ts at build time. */
export interface Production {
  title: string
  shortName: string
  /** Line above the start screen heading; '' hides it. */
  kicker: string
  logoAlt: string
  /** Names the IndexedDB database and prefixes the web storage keys; productions on one origin must differ. */
  storageId: string
}

export function parseProduction(input: Record<string, unknown>): Production {
  for (const k of ['title', 'shortName', 'kicker', 'logoAlt', 'storageId']) {
    if (k in input && typeof input[k] !== 'string') throw new Error(`production.json: ${k} must be a string`)
  }
  const title = (input.title as string | undefined) ?? 'Musical Practice'
  const p: Production = {
    title,
    shortName: (input.shortName as string | undefined) ?? title,
    kicker: (input.kicker as string | undefined) ?? '',
    logoAlt: (input.logoAlt as string | undefined) ?? '',
    storageId: (input.storageId as string | undefined) ?? 'mp',
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(p.storageId)) throw new Error(`production.json: storageId "${p.storageId}" must be lower-case ASCII`)
  return p
}
