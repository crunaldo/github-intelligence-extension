// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_CODE_TREE_PREFERENCES,
  DEFAULT_EXTENSION_PREFERENCES,
  getStoredPreferences,
  saveStoredPreferences,
  type CodeTreePreferences,
  type ExtensionPreferences,
} from '../storage'

function createMockChromeStorage(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial }
  return {
    store,
    local: {
      get: vi.fn(async (keys?: string | string[]) => {
        if (!keys) return { ...store }
        if (typeof keys === 'string') {
          return keys in store ? { [keys]: store[keys] } : {}
        }
        const out: Record<string, unknown> = {}
        for (const k of keys) {
          if (k in store) out[k] = store[k]
        }
        return out
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) delete store[k]
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(store)) delete store[k]
      }),
    },
  }
}

describe('storage.ts - Pro Preferences', () => {
  beforeEach(() => {
    const storageMock = createMockChromeStorage()
    ;(globalThis as any).chrome = {
      storage: { local: storageMock.local },
    }
  })

  it('provides default values for Octotree Pro preferences', () => {
    expect(DEFAULT_CODE_TREE_PREFERENCES.iconTheme).toBe('vscode')
    expect(DEFAULT_CODE_TREE_PREFERENCES.codeFontFamily).toBe('default')
    expect(DEFAULT_CODE_TREE_PREFERENCES.codeFontSize).toBe(13)
    expect(DEFAULT_CODE_TREE_PREFERENCES.codeFontLigatures).toBe(true)
    expect(DEFAULT_CODE_TREE_PREFERENCES.customEnterpriseDomains).toBe('')
    expect(DEFAULT_EXTENSION_PREFERENCES.tokenProfiles).toEqual([])
    expect(DEFAULT_EXTENSION_PREFERENCES.activeProfileId).toBe('default')
  })

  it('saves and merges extended code tree preferences and token profiles', async () => {
    const updated = await saveStoredPreferences({
      codeTree: {
        ...DEFAULT_CODE_TREE_PREFERENCES,
        iconTheme: 'seti',
        codeFontFamily: 'jetbrains',
        codeFontSize: 14,
        codeFontLigatures: true,
        customEnterpriseDomains: 'github.corp.internal',
      },
      tokenProfiles: [
        { id: 'work', label: 'Work GitHub', token: 'ghp_work123456789' },
      ],
      activeProfileId: 'work',
    })

    expect(updated.codeTree.iconTheme).toBe('seti')
    expect(updated.codeTree.codeFontFamily).toBe('jetbrains')
    expect(updated.codeTree.codeFontSize).toBe(14)
    expect(updated.codeTree.customEnterpriseDomains).toBe('github.corp.internal')
    expect(updated.tokenProfiles).toHaveLength(1)
    expect(updated.activeProfileId).toBe('work')

    const reloaded = await getStoredPreferences()
    expect(reloaded.codeTree.iconTheme).toBe('seti')
    expect(reloaded.codeTree.codeFontFamily).toBe('jetbrains')
    expect(reloaded.tokenProfiles[0]?.label).toBe('Work GitHub')
  })
})
