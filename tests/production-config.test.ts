import { describe, expect, it } from 'vitest'
import { production } from '../src/production'
import { parseProduction } from '../src/production-config'

describe('production config', () => {
  it('fills neutral defaults when there is no production.json', () => {
    expect(parseProduction({})).toEqual({ title: 'Musical Practice', shortName: 'Musical Practice', kicker: '', logoAlt: '', storageId: 'mp' })
  })

  it('takes the values of a production, short name falls back to the title', () => {
    const p = parseProduction({ title: 'LKG Musical 2026', kicker: 'Weihnachtsmusical 2026', logoAlt: 'LKG Radeland', storageId: 'gu' })
    expect(p).toMatchObject({ title: 'LKG Musical 2026', shortName: 'LKG Musical 2026', kicker: 'Weihnachtsmusical 2026', storageId: 'gu' })
  })

  it('rejects a storage id that cannot name a database and storage keys', () => {
    expect(() => parseProduction({ storageId: 'Gu Musical' })).toThrow(/storageId/)
  })

  it('rejects a field of the wrong type', () => {
    expect(() => parseProduction({ title: 3 })).toThrow(/title/)
  })

  it('builds without MP_PRODUCTION use the defaults', () => {
    expect(production.storageId).toBe('mp')
  })
})
