/**
 * Tracks guest repository analyses to enforce the soft-gate trial limit (4 free guest analyses).
 * On the 5th query or when accessing gated features, users are prompted to connect their GitHub account via 1-click OAuth.
 */

export const GUEST_ANALYSIS_LIMIT = 4
export const GUEST_ANALYSIS_COUNT_KEY = 'gpi_guest_analysis_count'

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local
  }
  return null
}

let memoryGuestCount = 0

/**
 * Returns how many guest analyses have been executed so far on this browser installation.
 */
export async function getGuestAnalysisCount(): Promise<number> {
  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      const res = (await storage.get(GUEST_ANALYSIS_COUNT_KEY)) as Record<string, unknown>
      const count = Number(res?.[GUEST_ANALYSIS_COUNT_KEY])
      return Number.isFinite(count) && count >= 0 ? count : 0
    } catch {
      // Fall through to memory
    }
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const raw = localStorage.getItem(GUEST_ANALYSIS_COUNT_KEY)
      const count = raw ? Number.parseInt(raw, 10) : 0
      return Number.isFinite(count) && count >= 0 ? count : 0
    }
  } catch {
    // Fall through to memory
  }

  return memoryGuestCount
}

/**
 * Increments the guest analysis counter by 1.
 */
export async function incrementGuestAnalysisCount(): Promise<number> {
  const current = await getGuestAnalysisCount()
  const next = current + 1
  memoryGuestCount = next

  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      await storage.set({ [GUEST_ANALYSIS_COUNT_KEY]: next })
      return next
    } catch {
      // Fall through
    }
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(GUEST_ANALYSIS_COUNT_KEY, String(next))
    }
  } catch {
    // Fall through
  }

  return next
}

/**
 * Determines whether the user must sign in with GitHub before proceeding.
 * If the user is already authenticated (has a session user ID), gate is never required.
 * If the user is a guest and has reached or exceeded GUEST_ANALYSIS_LIMIT (4), gate is required.
 */
export async function isGuestGateRequired(isAuthenticated: boolean): Promise<boolean> {
  if (isAuthenticated) {
    return false
  }
  const count = await getGuestAnalysisCount()
  return count >= GUEST_ANALYSIS_LIMIT
}

/**
 * Resets the guest analysis count (e.g. for testing).
 */
export async function resetGuestAnalysisCount(): Promise<void> {
  memoryGuestCount = 0
  const storage = getChromeStorageLocal()
  if (storage) {
    try {
      await storage.remove(GUEST_ANALYSIS_COUNT_KEY)
      return
    } catch {
      // Fall through
    }
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(GUEST_ANALYSIS_COUNT_KEY)
    }
  } catch {
    // Fall through
  }
}
