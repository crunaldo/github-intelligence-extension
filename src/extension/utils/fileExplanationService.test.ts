import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkFileExplanationQuota,
  explainFileWithAi,
  resetFileQuotaForTesting,
} from './fileExplanationService'

describe('fileExplanationService', () => {
  beforeEach(async () => {
    await resetFileQuotaForTesting()
  })

  it('allows free users 3 explanations per day', async () => {
    const initialQuota = await checkFileExplanationQuota(false)
    expect(initialQuota.canExplain).toBe(true)
    expect(initialQuota.remainingToday).toBe(3)
    expect(initialQuota.isPro).toBe(false)
  })

  it('decrements quota on each explanation and blocks when exhausted', async () => {
    const res1 = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/index.js',
      isPro: false,
    })
    expect(res1.remainingToday).toBe(2)
    expect(res1.explanation.summary).toBeDefined()

    const res2 = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/src/React.js',
      isPro: false,
    })
    expect(res2.remainingToday).toBe(1)

    const res3 = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/package.json',
      isPro: false,
    })
    expect(res3.remainingToday).toBe(0)

    const exhaustedQuota = await checkFileExplanationQuota(false)
    expect(exhaustedQuota.canExplain).toBe(false)
    expect(exhaustedQuota.remainingToday).toBe(0)

    // 4th call should throw or return blocked status
    await expect(
      explainFileWithAi({
        owner: 'facebook',
        repo: 'react',
        path: 'another.js',
        isPro: false,
      })
    ).rejects.toThrow(/cuota/i)
  })

  it('allows Pro users unlimited explanations', async () => {
    const proQuota = await checkFileExplanationQuota(true)
    expect(proQuota.canExplain).toBe(true)
    expect(proQuota.remainingToday).toBe(Infinity)
    expect(proQuota.isPro).toBe(true)

    // Pro user can call many times without error or decrementing Infinity
    const res = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/index.js',
      isPro: true,
    })
    expect(res.remainingToday).toBe(Infinity)
    expect(res.explanation.architectureRole).toBeDefined()
  })
})
