import type { RecentAnalysis, RepositoryReport } from '../features/repository/types'
import { setConfiguredGitHubToken } from '../features/repository/github'
import type { AppLanguage } from './i18n'

export type ExtensionPreferences = {
  githubToken: string
  autoSync: boolean
  theme: 'dark' | 'light' | 'system'
  autoAnalyzeOnPopup: boolean
  language: AppLanguage
}

export const DEFAULT_EXTENSION_PREFERENCES: ExtensionPreferences = {
  githubToken: '',
  autoSync: true,
  theme: 'light',
  autoAnalyzeOnPopup: true,
  language: 'auto',
}

export type FavoriteItem = {
  fullName: string
  url: string
  descriptionEs: string
  stars: number
  primaryLanguage: string
  savedAt: string
}

export type ExtensionState = {
  preferences: ExtensionPreferences
  favorites: FavoriteItem[]
  watchlist: string[]
  recent: RecentAnalysis[]
  reports: Record<string, RepositoryReport>
}

const STORAGE_KEYS = {
  PREFERENCES: 'gpi_preferences',
  FAVORITES: 'gpi_favorites',
  WATCHLIST: 'gpi_watchlist',
  RECENT: 'gpi_recent',
  REPORTS: 'gpi_reports',
}

function getChromeStorageLocal(): chrome.storage.StorageArea | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local
  }
  return null
}

export async function getStoredPreferences(): Promise<ExtensionPreferences> {
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.PREFERENCES)
    const prefs = { ...DEFAULT_EXTENSION_PREFERENCES, ...((result[STORAGE_KEYS.PREFERENCES] as Record<string, unknown>) || {}) }
    if (prefs.githubToken) {
      setConfiguredGitHubToken(prefs.githubToken)
    }
    return prefs
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES)
    if (!raw) return DEFAULT_EXTENSION_PREFERENCES
    const prefs = { ...DEFAULT_EXTENSION_PREFERENCES, ...JSON.parse(raw) }
    if (prefs.githubToken) {
      setConfiguredGitHubToken(prefs.githubToken)
    }
    return prefs
  } catch {
    return DEFAULT_EXTENSION_PREFERENCES
  }
}

/**
 * Reads the user's locally stored GitHub Personal Access Token.
 * Kept strictly in local browser storage and never transmitted to the backend API.
 */
export async function getStoredGitHubToken(): Promise<string> {
  const prefs = await getStoredPreferences()
  return (prefs.githubToken || '').trim()
}

export async function saveStoredPreferences(prefs: Partial<ExtensionPreferences>): Promise<ExtensionPreferences> {
  const current = await getStoredPreferences()
  const updated = { ...current, ...prefs }
  if (updated.githubToken !== undefined) {
    setConfiguredGitHubToken(updated.githubToken)
  }
  const storage = getChromeStorageLocal()
  if (storage) {
    await storage.set({ [STORAGE_KEYS.PREFERENCES]: updated })
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated))
  }
  return updated
}

export async function getStoredFavorites(): Promise<FavoriteItem[]> {
  let rawList: any[] = []
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(STORAGE_KEYS.FAVORITES)) as Record<string, any>
    rawList = Array.isArray(result[STORAGE_KEYS.FAVORITES]) ? result[STORAGE_KEYS.FAVORITES] : []
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES)
      rawList = raw ? JSON.parse(raw) : []
    } catch {
      rawList = []
    }
  }

  // Normalize legacy string format or incomplete items
  return rawList
    .filter(Boolean)
    .map((item) => {
      if (typeof item === 'string') {
        return {
          fullName: item,
          url: `https://github.com/${item}`,
          descriptionEs: 'Repositorio destacado guardado en favoritos.',
          stars: 0,
          primaryLanguage: 'Código',
          savedAt: new Date().toISOString(),
        }
      }
      const name = item?.fullName || (typeof item === 'string' ? item : '')
      return {
        fullName: name,
        url: item?.url || `https://github.com/${name}`,
        descriptionEs: item?.descriptionEs || 'Repositorio guardado en tus favoritos.',
        stars: typeof item?.stars === 'number' ? item.stars : 0,
        primaryLanguage: item?.primaryLanguage || 'Código',
        savedAt: item?.savedAt || new Date().toISOString(),
      }
    })
    .filter((item) => Boolean(item.fullName))
}

export async function toggleStoredFavorite(
  target: string | { fullName: string; url?: string; descriptionEs?: string; stars?: number; primaryLanguage?: string }
): Promise<boolean> {
  const list = await getStoredFavorites()
  const targetName = typeof target === 'string' ? target : target?.fullName || ''
  if (!targetName) return false

  const exists = list.some((item) => (item?.fullName || '').toLowerCase() === targetName.toLowerCase())

  let next: FavoriteItem[]
  if (exists) {
    next = list.filter((item) => (item?.fullName || '').toLowerCase() !== targetName.toLowerCase())
  } else {
    const newItem: FavoriteItem = typeof target === 'string' ? {
      fullName: target,
      url: `https://github.com/${target}`,
      descriptionEs: 'Repositorio guardado en favoritos.',
      stars: 0,
      primaryLanguage: 'Código',
      savedAt: new Date().toISOString(),
    } : {
      fullName: target.fullName,
      url: target.url || `https://github.com/${target.fullName}`,
      descriptionEs: target.descriptionEs || 'Repositorio guardado en favoritos.',
      stars: target.stars || 0,
      primaryLanguage: target.primaryLanguage || 'Código',
      savedAt: new Date().toISOString(),
    }
    next = [newItem, ...list]
  }

  const storage = getChromeStorageLocal()
  if (storage) {
    await storage.set({ [STORAGE_KEYS.FAVORITES]: next })
  } else {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next))
  }
  return !exists
}

export async function getStoredRecent(): Promise<RecentAnalysis[]> {
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(STORAGE_KEYS.RECENT)) as Record<string, any>
    return Array.isArray(result[STORAGE_KEYS.RECENT]) ? result[STORAGE_KEYS.RECENT] : []
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECENT)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function addStoredRecent(report: RepositoryReport): Promise<void> {
  try {
    const recentItem: RecentAnalysis = {
      fullName: report.repository.fullName,
      url: report.repository.htmlUrl,
      analyzedAt: report.analyzedAt,
      defaultBranch: report.repository.defaultBranch,
      stars: report.repository.stars,
      description: report.repository.description,
      languages: report.languages,
    }
    const current = await getStoredRecent()
    const filtered = current.filter((item) => item.fullName.toLowerCase() !== recentItem.fullName.toLowerCase())
    const updated = [recentItem, ...filtered].slice(0, 30)
    const storage = getChromeStorageLocal()
    if (storage) {
      await storage.set({ [STORAGE_KEYS.RECENT]: updated })
    } else {
      localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(updated))
    }
  } catch (err) {
    console.warn('Could not save recent item in local storage:', err)
  }
}

export async function getCachedReport(fullName: string): Promise<RepositoryReport | null> {
  const key = fullName.toLowerCase()
  let report: any = null
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(STORAGE_KEYS.REPORTS)) as Record<string, any>
    const reports: Record<string, any> = result[STORAGE_KEYS.REPORTS] || {}
    report = reports[key] || null
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS)
      if (!raw) return null
      const reports = JSON.parse(raw)
      report = reports[key] || null
    } catch {
      return null
    }
  }

  if (!report) return null
  return {
    ...report,
    dependencies: Array.isArray(report.dependencies) ? report.dependencies : [],
    importantFiles: Array.isArray(report.importantFiles) ? report.importantFiles : [],
    manifests: Array.isArray(report.manifests) ? report.manifests : [],
    languages: Array.isArray(report.languages) ? report.languages : [],
  }
}

function sanitizeReportForCache(report: RepositoryReport): RepositoryReport {
  const sanitizedTree =
    Array.isArray(report.tree) && report.tree.length > 1000
      ? report.tree.slice(0, 1000)
      : report.tree

  let sanitizedReadme = report.readme
  if (sanitizedReadme && typeof sanitizedReadme.text === 'string' && sanitizedReadme.text.length > 120_000) {
    sanitizedReadme = {
      ...sanitizedReadme,
      text: sanitizedReadme.text.slice(0, 120_000) + '\n\n... [Contenido truncado para almacenamiento local]',
    }
  }

  return {
    ...report,
    tree: sanitizedTree,
    readme: sanitizedReadme,
  }
}

export async function saveCachedReport(report: RepositoryReport): Promise<void> {
  const key = report.repository.fullName.toLowerCase()
  const storage = getChromeStorageLocal()
  const sanitized = sanitizeReportForCache(report)

  if (storage) {
    try {
      const result = (await storage.get(STORAGE_KEYS.REPORTS)) as Record<string, any>
      const reports: Record<string, any> = result[STORAGE_KEYS.REPORTS] || {}
      reports[key] = sanitized

      // Keep max 15 saved cached reports
      const keys = Object.keys(reports)
      while (keys.length > 15) {
        const oldest = keys.shift()
        if (oldest) delete reports[oldest]
      }
      await storage.set({ [STORAGE_KEYS.REPORTS]: reports })
    } catch (err) {
      // Self-healing: if quota exceeded or write failed, prune down to only the 3 latest reports
      try {
        const result = (await storage.get(STORAGE_KEYS.REPORTS)) as Record<string, any>
        const reports: Record<string, any> = result[STORAGE_KEYS.REPORTS] || {}
        const keys = Object.keys(reports)
        for (let i = 0; i < Math.max(0, keys.length - 2); i++) {
          delete reports[keys[i]]
        }
        reports[key] = sanitized
        await storage.set({ [STORAGE_KEYS.REPORTS]: reports })
      } catch (pruneErr) {
        // Silently log and do not throw so the active analysis is never interrupted
        console.warn('Failed to cache report in chrome.storage.local (quota exceeded):', pruneErr)
      }
    }
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS)
      const reports = raw ? JSON.parse(raw) : {}
      reports[key] = sanitized
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports))
    } catch {
      // quota limit
    }
  }
}

export async function getAllSavedReports(): Promise<RepositoryReport[]> {
  let rawReports: Record<string, any> = {}
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(STORAGE_KEYS.REPORTS)) as Record<string, any>
    rawReports = result[STORAGE_KEYS.REPORTS] || {}
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS)
      rawReports = raw ? JSON.parse(raw) : {}
    } catch {
      rawReports = {}
    }
  }

  const list = Object.values(rawReports).filter(Boolean) as RepositoryReport[]
  return list.map((r) => ({
    ...r,
    dependencies: Array.isArray(r.dependencies) ? r.dependencies : [],
    importantFiles: Array.isArray(r.importantFiles) ? r.importantFiles : [],
    manifests: Array.isArray(r.manifests) ? r.manifests : [],
    languages: Array.isArray(r.languages) ? r.languages : [],
  }))
}

export async function deleteSavedReport(fullName: string): Promise<void> {
  const key = fullName.toLowerCase()
  const storage = getChromeStorageLocal()
  if (storage) {
    const result = (await storage.get(STORAGE_KEYS.REPORTS)) as Record<string, any>
    const reports: Record<string, any> = result[STORAGE_KEYS.REPORTS] || {}
    delete reports[key]
    await storage.set({ [STORAGE_KEYS.REPORTS]: reports })
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REPORTS)
      if (!raw) return
      const reports = JSON.parse(raw)
      delete reports[key]
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports))
    } catch {
      // noop
    }
  }
}
