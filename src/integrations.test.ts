import { describe, expect, it } from 'vitest'
import { integrations } from './integrations'

describe('billing config: nobody spends the owner’s credits', () => {
  it('no declared integration is billed to the owner', () => {
    for (const [name, cfg] of Object.entries(integrations)) {
      expect(cfg.billing, `${name} must be billed to the caller`).toBe('user')
    }
  })

  it('no integration is open to signed-out visitors', () => {
    for (const cfg of Object.values(integrations)) expect(cfg.anonymous).toBeFalsy()
  })
})
