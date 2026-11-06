import { describe, expect, it } from 'vitest'
import { production } from '../src/production'
import { parseProduction } from '../src/production-config'

describe('production config', () => {
  it('fills neutral defaults when there is no production.json', () => {
    expect(parseProduction({})).toEqual({ title: 'Musical Practice', shortName: 'Musical Practice', kicker: '', logoAlt: '', storageId: 'mp' })
  })

  it('takes the values of a production, short name falls back to the title', () => {
    const p = parseProduction({ title: 'Sample Musical', kicker: 'Sample Production', logoAlt: 'Sample School', storageId: 'sm' })
    expect(p).toMatchObject({ title: 'Sample Musical', shortName: 'Sample Musical', kicker: 'Sample Production', storageId: 'sm' })
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
