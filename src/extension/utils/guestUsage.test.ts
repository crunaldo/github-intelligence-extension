import { describe, it, expect, beforeEach } from 'vitest'
import {
  getGuestAnalysisCount,
  incrementGuestAnalysisCount,
  isGuestGateRequired,
  resetGuestAnalysisCount,
  GUEST_ANALYSIS_LIMIT,
} from './guestUsage'

describe('guestUsage', () => {
  beforeEach(async () => {
    await resetGuestAnalysisCount()
  })

  it('starts at zero analyses and does not require gate initially', async () => {
    const count = await getGuestAnalysisCount()
    expect(count).toBe(0)
    expect(await isGuestGateRequired(false)).toBe(false)
  })

  it('increments guest count properly', async () => {
    expect(await incrementGuestAnalysisCount()).toBe(1)
    expect(await incrementGuestAnalysisCount()).toBe(2)
    expect(await getGuestAnalysisCount()).toBe(2)
    expect(await isGuestGateRequired(false)).toBe(false)
  })

  it('triggers gate requirement on 5th query (count >= GUEST_ANALYSIS_LIMIT)', async () => {
    for (let i = 0; i < GUEST_ANALYSIS_LIMIT; i++) {
      expect(await isGuestGateRequired(false)).toBe(false)
      await incrementGuestAnalysisCount()
    }

    expect(await getGuestAnalysisCount()).toBe(GUEST_ANALYSIS_LIMIT)
    expect(await isGuestGateRequired(false)).toBe(true)
  })

  it('never requires gate if user is authenticated even if limit exceeded', async () => {
    for (let i = 0; i < GUEST_ANALYSIS_LIMIT + 2; i++) {
      await incrementGuestAnalysisCount()
    }
    expect(await isGuestGateRequired(true)).toBe(false)
  })
})
