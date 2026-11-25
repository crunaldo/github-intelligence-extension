import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkFileExplanationQuota,
  explainFileWithAi,
  resetFileQuotaForTesting,
} from './fileExplanationService'
import * as backendClient from '../api/backendClient'

describe('fileExplanationService', () => {
  beforeEach(async () => {
    await resetFileQuotaForTesting()
    vi.restoreAllMocks()
  })

  it('allows free users 3 explanations per day by default locally', async () => {
    const initialQuota = await checkFileExplanationQuota(false)
    expect(initialQuota.canExplain).toBe(true)
    expect(initialQuota.remainingToday).toBe(3)
    expect(initialQuota.isPro).toBe(false)
  })

  it('calls backend to explain file and updates remaining quota', async () => {
    const mockBackend = vi.spyOn(backendClient, 'explainFileViaBackend').mockResolvedValueOnce({
      explanation: {
        summary: 'React package entrypoint',
        keyResponsibilities: ['Exports React hooks', 'Initializes runtime'],
        architectureRole: 'Entrypoint / Public API',
      },
      remainingToday: 2,
      isPro: false,
    })

    const res = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/index.js',
      isPro: false,
      locale: 'es',
    })

    expect(mockBackend).toHaveBeenCalledWith({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/index.js',
      ref: undefined,
      fileSnippet: undefined,
      locale: 'es',
    })
    expect(res.remainingToday).toBe(2)
    expect(res.explanation.summary).toBe('React package entrypoint')

    // Second call for the same file in the same session should hit in-memory cache without calling backend again
    const cachedRes = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/index.js',
      isPro: false,
    })
    expect(mockBackend).toHaveBeenCalledTimes(1)
    expect(cachedRes.explanation.summary).toBe('React package entrypoint')
  })

  it('handles backend 429 quota exceeded error cleanly', async () => {
    const quotaError = new backendClient.BackendApiError('Daily Pro limit reached', 429, 'PRO_QUOTA_EXHAUSTED')
    vi.spyOn(backendClient, 'explainFileViaBackend').mockRejectedValueOnce(quotaError)

    await expect(
      explainFileWithAi({
        owner: 'facebook',
        repo: 'react',
        path: 'packages/react/src/React.js',
        isPro: true,
        locale: 'es',
      })
    ).rejects.toThrow(/límite diario de tu plan PRO/i)
  })

  it('allows Pro users and returns backend Pro remaining quota', async () => {
    vi.spyOn(backendClient, 'explainFileViaBackend').mockResolvedValueOnce({
      explanation: {
        summary: 'React hooks implementation',
        keyResponsibilities: ['Implements useState and useEffect'],
        architectureRole: 'Core Hooks Engine',
      },
      remainingToday: 249,
      isPro: true,
    })

    const res = await explainFileWithAi({
      owner: 'facebook',
      repo: 'react',
      path: 'packages/react/src/ReactHooks.js',
      isPro: true,
      locale: 'es',
    })

    expect(res.remainingToday).toBe(249)
    expect(res.explanation.architectureRole).toBe('Core Hooks Engine')
  })
})
