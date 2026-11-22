import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = (file: string) => readFileSync(file, 'utf8')

describe('billing: unlisted integrations and pricing never fall back to the owner', () => {
  it('the proxy routes default unlisted integrations to the caller', () => {
    for (const file of ['src/server/http-routes.ts', 'src/server/action-routes.ts']) {
      const code = src(file)
      expect(code, file).toMatch(/billing \?\? 'user'/)
      expect(code, file).not.toMatch(/billing \?\? 'developer'/)
    }
  })

  it('the pricing action always passes the caller’s own token to the model', () => {
    const code = src('src/actions/price.ts')
    expect(code).toMatch(/authToken: callerJwt/)
    expect(code).toMatch(/if \(!callerJwt\) return fail/)
    expect(code).not.toMatch(/APP_OWNER_JWT/)
  })

  it('no app code reads the owner token, apart from the platform-provided proxy for declared owner-billed integrations', () => {
    for (const file of ['src/actions/price.ts', 'src/actions/offers.ts', 'src/actions/negotiate.ts', 'src/jobs.ts']) {
      expect(src(file), file).not.toMatch(/APP_OWNER_JWT/)
    }
  })
})
