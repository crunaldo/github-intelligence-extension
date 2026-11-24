import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  AlertCircle,
  Sparkles,
  Search,
  RefreshCw,
  FolderGit2,
  Layers,
  GitCompare,
  Settings,
  Star,
  ExternalLink,
  Copy,
  Download,
  Check,
  Tag,
  Code2,
  Trash2,
  X,
} from 'lucide-react'
import type { RepositoryReport, GitHubTarget } from '../../features/repository/types'
import {
  analyzeGitHubRepository,
  parseFlexibleGitHubUrl,
  extractRepoReference,
} from '../../features/repository/github'
import {
  clearLocalIntelligenceCache,
  fetchRemoteConfig,
  fetchRepoIntelligence,
  getModuleAccess,
  isDailyQuotaExceeded,
  markDailyQuotaExceeded,
  sanitizeCommitRef,
  type RemoteConfig,
} from '../api/backendClient'
import {
  getAuthSession,
  refreshProStatus,
  subscribeToAuthSession,
  type AuthSession,
} from '../auth/supabaseAuth'
import { ProFeatureGateCard } from '../components/ProFeatureGateCard'
import { createReportExport, downloadReport } from '../../features/repository/export'
import {
  getStoredPreferences,
  saveStoredPreferences,
  getStoredFavorites,
  toggleStoredFavorite,
  addStoredRecent,
  getCachedReport,
  saveCachedReport,
  getAllSavedReports,
  deleteSavedReport,
  type ExtensionPreferences,
  type FavoriteItem,
  DEFAULT_EXTENSION_PREFERENCES,
} from '../storage'
import { classifySummaryError, generateColloquialSpanishSummary } from '../spanishSummary'
import { LanguageBar } from '../components/LanguageBar'
import { RateLimitGauge } from '../components/RateLimitGauge'
import { CompareView } from '../components/CompareView'
import { SettingsView } from '../components/SettingsView'
import { detectSystemHardware, evaluateHardwareCompatibility, type HardwareInfo } from '../hardware'
import { HardwareCompatibilityCard } from '../components/HardwareCompatibilityCard'
import { ColloquialSummaryCard } from '../components/ColloquialSummaryCard'
import { RoadmapView } from '../components/RoadmapView'
import { resolveActiveLanguage, t } from '../i18n'
import { EditorLaunchButtons } from '../components/EditorLaunchButtons'
import { TranslatedDescription } from '../components/TranslatedDescription'
import { RepoHealthCard } from '../components/RepoHealthCard'
import { ArchitectureDiagramView } from '../components/ArchitectureDiagramView'
import { PackageInstallCommand } from '../components/PackageInstallCommand'
import { ApiErrorCard } from '../components/ApiErrorCard'
import { ExtHeaderBrand } from '../components/ExtHeaderBrand'
import { RepoHeroCard } from '../components/RepoHeroCard'
import { AnalysisMascot } from '../components/AnalysisMascot'
import { InteractiveBeamLoader } from '../components/InteractiveBeamLoader'
import { SegmentedPill } from '../components/SegmentedPill'
import { DirectoryTree } from '../components/DirectoryTree'
import { QuotaExceededCard } from '../components/QuotaExceededCard'
import { GitHubLoginGateCard } from '../components/GitHubLoginGateCard'
import { DeepTechnicalAuditCard } from '../components/DeepTechnicalAuditCard'
import {
  getGuestAnalysisCount,
  incrementGuestAnalysisCount,
  isGuestGateRequired,
} from '../utils/guestUsage'

type SidepanelNav = 'analyze' | 'reports' | 'compare' | 'favorites' | 'settings'
type ReportSection = 'overview' | 'architecture' | 'files' | 'dependencies' | 'releases' | 'sources'

export function SidepanelApp() {
  const [nav, setNav] = useState<SidepanelNav>('analyze')
  const [preferences, setPreferences] = useState<ExtensionPreferences>(DEFAULT_EXTENSION_PREFERENCES)
  const activeLocale = resolveActiveLanguage(preferences.language)
  const [urlInput, setUrlInput] = useState<string>('')
  const [dismissedDetectedRepo, setDismissedDetectedRepo] = useState<string | null>(null)
  const [report, setReport] = useState<RepositoryReport | null>(null)
  const [savedReports, setSavedReports] = useState<RepositoryReport[]>([])
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false)
  const [guestCount, setGuestCount] = useState<number>(0)
  const [showGuestGate, setShowGuestGate] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTabRepo, setActiveTabRepo] = useState<GitHubTarget | null>(null)
  const [reportSection, setReportSection] = useState<ReportSection>('overview')
  const [fileFilter, setFileFilter] = useState<string>('')
  const [copiedMd, setCopiedMd] = useState<boolean>(false)
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [refreshNonce, setRefreshNonce] = useState<number>(0)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightUrlRef = useRef<string | null>(null)

  useEffect(() => {
    void detectSystemHardware().then(setHardware)
    void getAuthSession().then(setSession).catch(() => {})
    void refreshProStatus().then((s) => s && setSession(s)).catch(() => {})
    void fetchRemoteConfig().then(setRemoteConfig).catch(() => {})
    void getGuestAnalysisCount().then(setGuestCount).catch(() => {})

    // Subscribe to live auth session updates across storage
    const unsubscribeAuth = subscribeToAuthSession((updated) => {
      setSession(updated)
      if (updated?.user?.id) {
        setShowGuestGate(false)
      }
    })

    // Auto-sync on window focus or visibility change
    const handleSync = () => {
      void refreshProStatus().then((s) => s && setSession(s)).catch(() => {})
      void fetchRemoteConfig({ forceRefresh: true }).then(setRemoteConfig).catch(() => {})
    }

    window.addEventListener('focus', handleSync)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleSync()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Periodic sync every 45s while open
    const interval = setInterval(handleSync, 45_000)

    return () => {
      unsubscribeAuth()
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(interval)
    }
  }, [])

  const isPro = Boolean(session?.isPro)

  const summaryAccess = getModuleAccess(remoteConfig, 'summary', 'free')
  const installAccess = getModuleAccess(remoteConfig, 'installCommand', 'free')
  const sandboxAccess = getModuleAccess(remoteConfig, 'cloudSandbox', 'free')
  const hardwareAccess = getModuleAccess(remoteConfig, 'hardwareCompat', 'free')
  const roadmapAccess = getModuleAccess(remoteConfig, 'roadmap', 'free')
  const healthAccess = getModuleAccess(remoteConfig, 'repoHealth', 'free')
  const archAccess = getModuleAccess(remoteConfig, 'architectureDiagram', 'pro')
  const depAccess = getModuleAccess(remoteConfig, 'dependencies', 'free')
  const fileAccess = getModuleAccess(remoteConfig, 'fileTree', 'free')

  const compat = useMemo(() => {
    if (!hardware || !report) return null
    return evaluateHardwareCompatibility(hardware, report)
  }, [hardware, report])

  // Load initial preferences, reports, favorites
  const loadInitialData = useCallback(async () => {
    const prefs = await getStoredPreferences()
    setPreferences(prefs)
    document.documentElement.setAttribute('data-theme', prefs.theme === 'system' ? 'dark' : prefs.theme)

    const allReports = await getAllSavedReports()
    setSavedReports(allReports)

    const favs = await getStoredFavorites()
    setFavorites(favs)
  }, [])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  // Perform analysis of repository
  const performAnalysis = useCallback(
    async (urlToAnalyze: string, force = false) => {
      let target: GitHubTarget
      try {
        target = parseFlexibleGitHubUrl(urlToAnalyze)
      } catch {
        const fallback = extractRepoReference(urlToAnalyze)
        if (fallback) {
          target = fallback
        } else {
          setError('Ingresa un repositorio válido de GitHub (ej. facebook/react o https://github.com/owner/repo).')
          return
        }
      }

      setError(null)
      setUrlInput(target.originalUrl)
      setActiveTabRepo(target)
      setNav('analyze')

      // If an analysis for this exact repository is already in flight, do not duplicate or abort it
      if (inFlightUrlRef.current === target.originalUrl && !force) {
        return
      }

      // Mark this repository in flight immediately
      inFlightUrlRef.current = target.originalUrl

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      // Immediately clear previous report and set loading = true so InteractiveBeamLoader appears instantly
      setReport(null)
      setLoading(true)
      setQuotaExceeded(false)
      setShowGuestGate(false)

      // Fetch fresh auth session to avoid stale closure / async state lag
      const currentSession = await getAuthSession().catch(() => session)
      if (currentSession && currentSession.user?.id !== session?.user?.id) {
        setSession(currentSession)
      }

      if (!force) {
        const cached = await getCachedReport(target.originalUrl)
        if (cached) {
          const isProUser = Boolean(currentSession?.isPro)
          const needsArch = isProUser || archAccess === 'free'
          const hasArch = Boolean(cached.aiAnalysis?.architectureDiagram)

          if (needsArch && cached.aiAnalysis && !hasArch) {
            // The cached report was created under Free tier without architectureDiagram.
            // Invalidate the stripped AI analysis so fresh Pro analysis is fetched
            cached.aiAnalysis = undefined
          } else {
            // Provide smooth visual feedback with beam loader for cached reports
            await new Promise((r) => setTimeout(r, 450))
            if (inFlightUrlRef.current !== target.originalUrl) return
            setReport(cached)
            setQuotaExceeded(false)
            setNav('analyze')
            setLoading(false)
            inFlightUrlRef.current = null
            return
          }
        }
      }

      // Pre-check if guest trial limit was reached (4 free trial analyses)
      const isAuth = Boolean(currentSession?.user?.id)
      const gateRequired = await isGuestGateRequired(isAuth)
      if (gateRequired) {
        if (inFlightUrlRef.current !== target.originalUrl) return
        setReport(null)
        setShowGuestGate(true)
        setLoading(false)
        setError(null)
        setNav('analyze')
        inFlightUrlRef.current = null
        return
      }

      // Pre-check if daily free quota was already exceeded today
      const quotaExceededToday = await isDailyQuotaExceeded()
      if (quotaExceededToday) {
        if (inFlightUrlRef.current !== target.originalUrl) return
        setReport(null)
        setQuotaExceeded(true)
        setLoading(false)
        setError(null)
        setNav('analyze')
        inFlightUrlRef.current = null
        return
      }

      try {
        // 1. Fetch GitHub metadata, commits, tree and manifests
        const res = await analyzeGitHubRepository(target, controller.signal)

        if (inFlightUrlRef.current !== target.originalUrl) return

        // PROGRESSIVE STREAMING UI:
        // As soon as GitHub data arrives, reveal the full UI immediately!
        // The user can explore repo info, files, dependencies, install command, etc.
        setReport(res)
        setLoading(false)
        setNav('analyze')

        // 2. Fetch AI intelligence in background while user explores the repository
        const owner = res.repository?.owner || target.owner
        const repo = res.repository?.name || target.repository
        const commitSha = sanitizeCommitRef(
          res.latestCommit?.sha || res.resolvedRef || res.repository?.defaultBranch
        )

        try {
          const aiAnalysis = await fetchRepoIntelligence(
            owner,
            repo,
            commitSha,
            force ? { forceRefresh: true } : undefined
          )
          if (inFlightUrlRef.current !== target.originalUrl) return
          res.aiAnalysis = aiAnalysis
          setReport((prev) => (prev ? { ...prev, aiAnalysis } : res))
        } catch (aiErr: unknown) {
          const summaryErr = classifySummaryError(aiErr)
          if (summaryErr.quotaExceeded) {
            await markDailyQuotaExceeded()
            if (inFlightUrlRef.current === target.originalUrl) {
              setReport(null)
              setQuotaExceeded(true)
              setLoading(false)
              inFlightUrlRef.current = null
            }
            return
          }
          console.warn('AI analysis skipped/failed:', aiErr)
        }

        if (inFlightUrlRef.current !== target.originalUrl) return

        if (force) {
          setRefreshNonce((n) => n + 1)
        }
        setReport((prev) => prev || res)
        setQuotaExceeded(false)
        if (!currentSession?.user?.id) {
          const nextCount = await incrementGuestAnalysisCount()
          setGuestCount(nextCount)
        }
        try {
          await saveCachedReport(res)
          await addStoredRecent(res)
          const updatedList = await getAllSavedReports()
          setSavedReports(updatedList)
        } catch (cacheErr) {
          console.warn('Could not cache report locally:', cacheErr)
        }
        setNav('analyze')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (inFlightUrlRef.current === target.originalUrl) {
          const errorMsg = err instanceof Error ? err.message : String(err || '')
          const lower = errorMsg.toLowerCase()
          const isRateLimit =
            lower.includes('rate limit exceeded') ||
            lower.includes('rate limit') ||
            lower.includes('higher rate limit') ||
            lower.includes('secondary rate limit')

          // If unauthenticated and hit GitHub's anonymous IP rate limit, seamlessly route to the official GitHub login gate
          if (!currentSession?.user?.id && isRateLimit) {
            setShowGuestGate(true)
            setError(null)
            setReport(null)
            setNav('analyze')
          } else {
            setError(errorMsg || 'Error al analizar el repositorio.')
          }
        }
      } finally {
        if (inFlightUrlRef.current === target.originalUrl) {
          inFlightUrlRef.current = null
          setLoading(false)
        }
      }
    },
    [session?.isPro, archAccess]
  )

  // Automatically fetch missing architecture diagram if user is/becomes Pro while viewing a cached report
  useEffect(() => {
    if (isPro && report && report.aiAnalysis && !report.aiAnalysis.architectureDiagram) {
      const owner = report.repository?.owner || report.target?.owner
      const repo = report.repository?.name || report.target?.repository
      const commitSha = sanitizeCommitRef(
        report.latestCommit?.sha || report.resolvedRef || report.repository?.defaultBranch
      )
      if (owner && repo) {
        void fetchRepoIntelligence(owner, repo, commitSha, { forceRefresh: true })
          .then((aiAnalysis) => {
            setReport((prev) => {
              if (!prev) return prev
              const updated = { ...prev, aiAnalysis }
              void saveCachedReport(updated)
              return updated
            })
          })
          .catch(() => {})
      }
    }
  }, [isPro, report])

  // Detect pending analysis from context menu / floating pill, active tab, and live messages
  useEffect(() => {
    function inspectUrl(tabUrl: string) {
      try {
        const target = parseFlexibleGitHubUrl(tabUrl)
        setActiveTabRepo(target)
        // If there's no report yet, analyze it automatically
        if (!report) {
          void performAnalysis(target.originalUrl, false)
        }
      } catch {
        setActiveTabRepo(null)
      }
    }

    async function checkPendingAnalysis(): Promise<boolean> {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          const stored = await chrome.storage.local.get('gpi_pending_analysis')
          if (stored?.gpi_pending_analysis) {
            const pending = stored.gpi_pending_analysis as GitHubTarget
            await chrome.storage.local.remove('gpi_pending_analysis')
            setUrlInput(pending.originalUrl)
            setActiveTabRepo(pending)
            setNav('analyze')
            void performAnalysis(pending.originalUrl, false)
            return true
          }
        } catch {
          // Ignore
        }
      }
      return false
    }

    async function checkActiveTab() {
      const hadPending = await checkPendingAnalysis()
      if (hadPending) return

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          if (tab?.url) {
            inspectUrl(tab.url)
            return
          }
          const [fallbackTab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (fallbackTab?.url) {
            inspectUrl(fallbackTab.url)
          }
        } catch {
          // Ignore
        }
      }
    }

    void checkActiveTab()

    // Check if there was a pending navigation request (e.g. from in-page code tree dock settings button)
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      void chrome.storage.session.get('gpi_pending_nav').then((res) => {
        const pending = res?.gpi_pending_nav as { tab?: SidepanelNav; target?: string; timestamp?: number } | undefined
        if (pending?.tab && pending.timestamp && Date.now() - pending.timestamp < 10000) {
          chrome.storage.session.remove('gpi_pending_nav').catch(() => {})
          setNav(pending.tab)
          if (pending.target === 'codeTree') {
            setTimeout(() => {
              const el = document.getElementById('code-tree-settings')
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                el.style.borderColor = 'var(--accent-cyan)'
                el.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.4)'
                setTimeout(() => {
                  el.style.borderColor = ''
                  el.style.boxShadow = ''
                }, 2200)
              }
            }, 300)
          }
        }
      }).catch(() => {})
    }

    // Listen for TRIGGER_ANALYSIS and NAVIGATE_SIDEPANEL_TAB messages from background or dock
    const onMessage = (msg: { type: string; target?: GitHubTarget | string; tab?: string }) => {
      if (msg?.type === 'TRIGGER_ANALYSIS' && typeof msg.target === 'object' && msg.target?.originalUrl) {
        setUrlInput(msg.target.originalUrl)
        setActiveTabRepo(msg.target)
        setNav('analyze')
        void performAnalysis(msg.target.originalUrl, false)
      } else if (msg?.type === 'NAVIGATE_SIDEPANEL_TAB' && msg.tab) {
        setNav(msg.tab as SidepanelNav)
        if (msg.target === 'codeTree') {
          setTimeout(() => {
            const el = document.getElementById('code-tree-settings')
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              el.style.borderColor = 'var(--accent-cyan)'
              el.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.4)'
              setTimeout(() => {
                el.style.borderColor = ''
                el.style.boxShadow = ''
              }, 2200)
            }
          }, 250)
        }
      }
    }

    // Listen for storage changes in case gpi_pending_analysis arrives while open
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.gpi_pending_analysis?.newValue) {
        const pending = changes.gpi_pending_analysis.newValue as GitHubTarget
        chrome.storage.local.remove('gpi_pending_analysis').catch(() => {})
        setUrlInput(pending.originalUrl)
        setActiveTabRepo(pending)
        setNav('analyze')
        void performAnalysis(pending.originalUrl, false)
      }
    }

    if (typeof chrome !== 'undefined') {
      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(onMessage)
      }
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(onStorageChange)
      }
    }

    // Listen for tab switching and URL updates in real time
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId)
          if (tab?.url) inspectUrl(tab.url)
        } catch {
          // Ignore
        }
      }
      const onUpdated = async (tabId: number, changeInfo: { status?: string; url?: string }) => {
        if (changeInfo.url) {
          try {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (currentTab?.id === tabId && currentTab?.url) {
              inspectUrl(currentTab.url)
            }
          } catch {
            // Ignore
          }
        }
      }

      chrome.tabs.onActivated.addListener(onActivated)
      chrome.tabs.onUpdated.addListener(onUpdated)

      return () => {
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(onMessage)
        }
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(onStorageChange)
        }
        chrome.tabs.onActivated.removeListener(onActivated)
        chrome.tabs.onUpdated.removeListener(onUpdated)
      }
    }

    return () => {
      if (typeof chrome !== 'undefined') {
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(onMessage)
        }
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(onStorageChange)
        }
      }
    }
  }, [report, performAnalysis])

  const handleToggleFavorite = async (fullName: string) => {
    if (report && (report.repository?.fullName || '').toLowerCase() === (fullName || '').toLowerCase()) {
      const summary = generateColloquialSpanishSummary(report, activeLocale)
      await toggleStoredFavorite({
        fullName: report.repository.fullName,
        url: report.repository.htmlUrl,
        descriptionEs: summary.shortDescription || summary.whatItIs,
        stars: report.repository.stars,
        primaryLanguage: report.languages[0]?.name || 'Código',
      })
    } else {
      await toggleStoredFavorite(fullName)
    }
    const updatedFavs = await getStoredFavorites()
    setFavorites(updatedFavs)
  }

  const handleDeleteReport = async (fullName: string) => {
    await deleteSavedReport(fullName)
    const updated = await getAllSavedReports()
    setSavedReports(updated)
    if ((report?.repository?.fullName || '').toLowerCase() === (fullName || '').toLowerCase()) {
      setReport(null)
    }
  }

  const handleCopyMarkdown = () => {
    if (!report) return
    const exportData = createReportExport(report, 'markdown')
    navigator.clipboard.writeText(exportData.contents).then(() => {
      setCopiedMd(true)
      setTimeout(() => setCopiedMd(false), 2000)
    })
  }

  const handleExportDownload = (format: 'markdown' | 'json') => {
    if (!report) return
    void downloadReport(report, format)
  }

  const isCurrentFavorite = report
    ? favorites.some((f) => (f?.fullName || '').toLowerCase() === (report?.repository?.fullName || '').toLowerCase())
    : false

  return (
    <div className="extension-sidepanel-container">
      {/* Top Header */}
      <header className="ext-header">
        <ExtHeaderBrand tag="Side Panel" />

        <div className="ext-header-actions">
          {!session?.user?.id && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                background: 'rgba(56, 189, 248, 0.12)',
                color: 'var(--brand-primary, #38bdf8)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title={activeLocale === 'es' ? 'Consultas de prueba restantes como invitado' : 'Free guest trial queries remaining'}
            >
              <span>{t('guest_counter_badge', activeLocale).replace('{count}', String(guestCount))}</span>
            </span>
          )}

          <div
            onClick={() => setNav('settings')}
            style={{ cursor: 'pointer' }}
            title={activeLocale === 'es' ? 'Estado de conexión con GitHub' : 'GitHub connection status'}
          >
            <RateLimitGauge
              hasToken={Boolean(preferences.githubToken || session?.user?.id)}
              locale={activeLocale}
            />
          </div>
        </div>
      </header>

      {/* Remote Admin Banner Message (maintenance or broadcast) */}
      {remoteConfig?.featureFlags.bannerMessage && (
        <div
          className="ext-api-alert-banner"
          style={
            remoteConfig.featureFlags.maintenanceMode
              ? {
                  borderColor: 'rgba(244, 63, 94, 0.35)',
                  background: 'rgba(244, 63, 94, 0.1)',
                }
              : undefined
          }
        >
          <div className="ext-api-alert-content">
            <AlertCircle
              size={14}
              className="ext-api-alert-icon"
              style={
                remoteConfig.featureFlags.maintenanceMode
                  ? { color: 'var(--accent-rose)' }
                  : undefined
              }
            />
            <div className="ext-api-alert-text">
              {remoteConfig.featureFlags.bannerMessage}
            </div>
          </div>
        </div>
      )}

      {/* Nuevo repositorio detectado al cambiar de pestaña */}
      {activeTabRepo && report && `${activeTabRepo.owner}/${activeTabRepo.repository}`.toLowerCase() !== (report.repository?.fullName || '').toLowerCase() && dismissedDetectedRepo !== activeTabRepo.originalUrl && (
        <div className="ext-new-repo-detected-banner animate-fade-in">
          <div className="new-repo-banner-left">
            <span className="pulse-dot-amber" />
            <div className="new-repo-banner-text">
              <span className="new-repo-banner-title">
                {activeLocale === 'es' ? 'Nuevo repositorio detectado' : 'New repository detected'}
              </span>
              <span className="new-repo-banner-name">
                {activeTabRepo.owner}/{activeTabRepo.repository}
              </span>
            </div>
          </div>
          <div className="new-repo-banner-actions">
            <button
              type="button"
              className="btn-new-repo-switch"
              onClick={() => void performAnalysis(activeTabRepo.originalUrl, false)}
            >
              <Sparkles size={12} />
              <span>{activeLocale === 'es' ? 'Analizar este repo' : 'Analyze this repo'}</span>
            </button>
            <button
              type="button"
              className="ext-btn-icon-dismiss"
              onClick={() => setDismissedDetectedRepo(activeTabRepo.originalUrl)}
              title={activeLocale === 'es' ? 'Descartar aviso' : 'Dismiss'}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Search and Navigation Bar */}
      <div className="ext-search-card">
        <form
          className="ext-search-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (urlInput.trim()) void performAnalysis(urlInput.trim())
          }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="ext-search-input"
            placeholder={t('search_placeholder', activeLocale)}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button type="submit" className="ext-search-btn" disabled={loading || !urlInput.trim()}>
            {loading ? <RefreshCw size={12} className="animate-spin" /> : t('analyze_btn', activeLocale)}
          </button>
        </form>
      </div>

      {/* Main Tabs Navigation */}
      <div className="ext-tabs-bar">
        <button
          type="button"
          className={`ext-tab-btn ${nav === 'analyze' ? 'active' : ''}`}
          onClick={() => setNav('analyze')}
        >
          <Layers size={13} />
          <span>{activeLocale === 'es' ? 'Analizar' : 'Analyze'}</span>
        </button>
        <button
          type="button"
          className={`ext-tab-btn ${nav === 'reports' ? 'active' : ''}`}
          onClick={() => setNav('reports')}
        >
          <FolderGit2 size={13} />
          <span>{activeLocale === 'es' ? 'Reportes' : 'Reports'} ({savedReports?.length || 0})</span>
        </button>
        <button
          type="button"
          className={`ext-tab-btn ${nav === 'compare' ? 'active' : ''}`}
          onClick={() => setNav('compare')}
        >
          <GitCompare size={13} />
          <span>{activeLocale === 'es' ? 'Comparar' : 'Compare'}</span>
        </button>
        <button
          type="button"
          className={`ext-tab-btn ${nav === 'favorites' ? 'active' : ''}`}
          onClick={() => setNav('favorites')}
        >
          <Star size={13} />
          <span>{activeLocale === 'es' ? 'Favoritos' : 'Favorites'} ({favorites?.length || 0})</span>
        </button>
        <button
          type="button"
          className={`ext-tab-btn ${nav === 'settings' ? 'active' : ''}`}
          onClick={() => setNav('settings')}
        >
          <Settings size={13} />
          <span>{t('settings', activeLocale)}</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="ext-body">
        {error && (
          <ApiErrorCard
            error={error}
            locale={activeLocale}
            onOpenSettings={() => setNav('settings')}
            onRetry={() => {
              if (report) {
                void performAnalysis(report.target.originalUrl, true)
              } else if (activeTabRepo) {
                void performAnalysis(activeTabRepo.originalUrl, true)
              }
            }}
            onDismiss={() => setError(null)}
          />
        )}

        {/* VIEW 1: ANALYZE */}
        {nav === 'analyze' && (
          <>
            {loading && (
              <InteractiveBeamLoader
                repoName={activeTabRepo ? `${activeTabRepo.owner}/${activeTabRepo.repository}` : (urlInput || report?.repository?.fullName || undefined)}
                locale={activeLocale}
              />
            )}

            {showGuestGate && !loading && (
              <GitHubLoginGateCard
                locale={activeLocale}
                repoName={activeTabRepo ? `${activeTabRepo.owner}/${activeTabRepo.repository}` : (urlInput || undefined)}
                onLoggedIn={(newSession) => {
                  setSession(newSession)
                  setShowGuestGate(false)
                  void performAnalysis(activeTabRepo?.originalUrl || urlInput, true)
                }}
                onDismiss={() => setNav('settings')}
              />
            )}

            {quotaExceeded && !loading && !showGuestGate && (
              <QuotaExceededCard
                locale={activeLocale}
                repoName={activeTabRepo ? `${activeTabRepo.owner}/${activeTabRepo.repository}` : (urlInput || undefined)}
                onProVerified={() => {
                  setQuotaExceeded(false)
                  void performAnalysis(activeTabRepo?.originalUrl || urlInput, true)
                }}
              />
            )}

            {!loading && !report && !quotaExceeded && !showGuestGate && (
              <div className="ext-empty-state">
                <AnalysisMascot moodOverride="neutral" size={76} />
                <div className="empty-title" style={{ marginTop: 8 }}>{t('no_repo_selected', activeLocale)}</div>
                <div className="empty-desc">
                  {t('no_repo_selected_desc', activeLocale)}
                </div>
              </div>
            )}

            {!loading && report && !quotaExceeded && !showGuestGate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. MÓDULO HERO PRINCIPAL DE MARCA CON MASCOTA REACTIVA */}
                <RepoHeroCard
                  report={report}
                  locale={activeLocale}
                  actions={
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="ext-btn-icon"
                        onClick={() => void handleToggleFavorite(report.repository.fullName)}
                        title={isCurrentFavorite ? (activeLocale === 'es' ? 'Quitar de favoritos' : 'Remove favorite') : (activeLocale === 'es' ? 'Guardar en favoritos' : 'Save favorite')}
                        style={{ color: isCurrentFavorite ? 'var(--accent-amber)' : undefined }}
                      >
                        <Star size={14} fill={isCurrentFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className="ext-btn-icon"
                        onClick={() => void performAnalysis(report.target.originalUrl, true)}
                        title={t('reload_analysis', activeLocale)}
                        disabled={loading}
                      >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  }
                />

                {/* Contenedor de Detalles y Acciones Rápidas */}
                <div className="repo-hero-integrated-card">
                  {/* Explicación del Repo Integrada Aquí Mismo de Primero */}
                  {summaryAccess !== 'disabled' && (
                    summaryAccess === 'pro' && !isPro ? (
                      <ProFeatureGateCard
                        moduleName={activeLocale === 'es' ? 'Resumen Ejecutivo & Coloquial' : 'Executive & Colloquial Summary'}
                        description={activeLocale === 'es' ? 'Explicación concisa y técnica sobre qué es el proyecto, por qué importa y para quién está diseñado.' : 'Concise technical summary explaining what the project is, why it matters, and who it is designed for.'}
                        locale={activeLocale}
                        onUpgraded={setSession}
                      />
                    ) : (
                      <div className="integrated-summary-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                        <ColloquialSummaryCard
                          report={report}
                          locale={activeLocale}
                          refreshNonce={refreshNonce}
                          onQuotaExceeded={() => {
                            setQuotaExceeded(true)
                            setReport(null)
                          }}
                        />
                      </div>
                    )
                  )}

                  {/* 📦 Comando de Instalación en 1-Clic */}
                  {installAccess !== 'disabled' && (
                    installAccess === 'pro' && !isPro ? (
                      <div style={{ marginTop: 6 }}>
                        <ProFeatureGateCard
                          moduleName={activeLocale === 'es' ? 'Comando de Instalación en 1-Clic' : '1-Click Install Command'}
                          description={activeLocale === 'es' ? 'Detección inteligente de gestor de paquetes y comando de instalación listo para copiar.' : 'Smart package manager detection with copy-ready terminal install commands.'}
                          locale={activeLocale}
                          onUpgraded={setSession}
                        />
                      </div>
                    ) : (
                      <div style={{ marginTop: 6 }}>
                        <PackageInstallCommand report={report} locale={activeLocale} />
                      </div>
                    )
                  )}

                  {/* ⚡ 2. Clonado y Apertura en 1 Clic en tu Editor / Sandbox en la Nube */}
                  {sandboxAccess !== 'disabled' && (
                    sandboxAccess === 'pro' && !isPro ? (
                      <div style={{ marginTop: 6 }}>
                        <ProFeatureGateCard
                          moduleName={activeLocale === 'es' ? 'Sandboxes & Apertura en la Nube' : 'Cloud Sandboxes & Web IDEs'}
                          description={activeLocale === 'es' ? 'Abre y ejecuta repositorios en 1 clic en StackBlitz, CodeSandbox, GitHub Codespaces o VS Code.' : 'Launch and test repositories in 1-click inside StackBlitz, CodeSandbox, Codespaces, or VS Code.'}
                          locale={activeLocale}
                          onUpgraded={setSession}
                        />
                      </div>
                    ) : (
                      <div style={{ marginTop: 6 }}>
                        <EditorLaunchButtons repoUrl={report.repository.htmlUrl} fullName={report.repository.fullName} locale={activeLocale} />
                      </div>
                    )
                  )}
                </div>

                {/* 2. Hardware & PC Compatibility Card */}
                {hardwareAccess !== 'disabled' && (
                  hardwareAccess === 'pro' && !isPro ? (
                    <ProFeatureGateCard
                      moduleName={activeLocale === 'es' ? 'Compatibilidad de Hardware del PC' : 'PC Hardware Compatibility'}
                      description={activeLocale === 'es' ? 'Auditoría inteligente de CPU, GPU y memoria RAM para determinar si tu equipo puede compilar y ejecutar este proyecto.' : 'Smart audit of CPU, GPU, and RAM to determine if your machine can build and run this repository.'}
                      locale={activeLocale}
                      onUpgraded={setSession}
                    />
                  ) : (
                    <HardwareCompatibilityCard hardware={hardware} compat={compat} locale={activeLocale} />
                  )
                )}

                {/* 3. Short Installation Roadmap */}
                {roadmapAccess !== 'disabled' && (
                  roadmapAccess === 'pro' && !isPro ? (
                    <ProFeatureGateCard
                      moduleName={activeLocale === 'es' ? 'Roadmap de Puesta en Marcha' : 'Quickstart Installation Roadmap'}
                      description={activeLocale === 'es' ? 'Guía paso a paso adaptada a tu sistema operativo con los comandos exactos para clonar, configurar y correr el código.' : 'Step-by-step roadmap tailored to your OS with exact commands to clone, configure, and build.'}
                      locale={activeLocale}
                      onUpgraded={setSession}
                    />
                  ) : (
                    <RoadmapView report={report} hardware={hardware} locale={activeLocale} />
                  )
                )}

                {/* Sub-section navigation via SegmentedPill */}
                <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                  <SegmentedPill<ReportSection>
                    options={[
                      { id: 'overview', label: t('tab_summary', activeLocale) },
                      { id: 'architecture', label: t('tab_architecture', activeLocale) },
                      { id: 'dependencies', label: `${t('tab_dependencies', activeLocale)} (${report.dependencies?.length || 0})` },
                      { id: 'files', label: `${t('tab_files', activeLocale)} (${report.importantFiles?.length || 0})` },
                      { id: 'releases', label: t('tab_releases', activeLocale) },
                      { id: 'sources', label: t('tab_sources', activeLocale) },
                    ]}
                    value={reportSection}
                    onChange={(val) => setReportSection(val)}
                    size="sm"
                  />
                </div>

                {/* Sub-section Content */}
                {reportSection === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 🛡️ 2. Auditoría Técnica Profunda (Fortalezas & Riesgos) */}
                    <DeepTechnicalAuditCard report={report} locale={activeLocale} />

                    {/* 🩺 3. Índice de Salud & Actividad Detallado */}
                    {healthAccess !== 'disabled' && (
                      healthAccess === 'pro' && !isPro ? (
                        <ProFeatureGateCard
                          moduleName={activeLocale === 'es' ? 'Índice de Salud & Actividad' : 'Repository Health & Velocity Index'}
                          description={activeLocale === 'es' ? 'Puntaje de mantenimiento, frecuencia de commits, velocidad de PRs y tasa de resolución de issues.' : 'Maintenance score, commit cadence, PR turnaround time, and issue resolution ratio.'}
                          locale={activeLocale}
                          onUpgraded={setSession}
                        />
                      ) : (
                        <RepoHealthCard report={report} locale={activeLocale} />
                      )
                    )}

                    <div className="insight-card">
                      <div className="insight-title" style={{ color: 'var(--text-secondary)' }}>
                        <span>Distribución de Lenguajes</span>
                      </div>
                      <LanguageBar languages={report.languages} />
                    </div>

                    <div className="insight-card">
                      <div className="insight-title" style={{ color: 'var(--text-secondary)' }}>
                        <span>Stack & Resumen Técnico</span>
                      </div>
                      <p className="insight-text">{report.technicalSummary}</p>
                    </div>
                  </div>
                )}

                {reportSection === 'architecture' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 📊 4. Diagrama Visual de Arquitectura Pro & Auditoría Profunda */}
                    {archAccess !== 'disabled' && (
                      <ArchitectureDiagramView
                        report={report}
                        locale={activeLocale}
                        diagramsEnabled={remoteConfig?.featureFlags.enableDiagrams}
                        archAccess={archAccess}
                        isPro={isPro}
                        onAnalysisUpdated={(updatedAnalysis) => {
                          setReport((prev) => {
                            if (!prev) return prev
                            const updated = { ...prev, aiAnalysis: updatedAnalysis }
                            void saveCachedReport(updated)
                            return updated
                          })
                        }}
                        onQuotaExceeded={() => {
                          setQuotaExceeded(true)
                          setReport(null)
                        }}
                      />
                    )}

                    <div className="insight-card">
                      <div className="insight-title" style={{ color: 'var(--text-secondary)' }}>
                        <span>Estructura de Directorios Raíz</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 4 }}>
                        {report.rootDirectories.map((dir) => (
                          <div
                            key={dir.name}
                            style={{
                              background: 'var(--bg-surface-elevated)',
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>📁 {dir.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{dir.files} archivos</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {reportSection === 'dependencies' && (
                  depAccess !== 'disabled' ? (
                    depAccess === 'pro' && !isPro ? (
                      <ProFeatureGateCard
                        moduleName={activeLocale === 'es' ? 'Inspector de Dependencias & Manifests' : 'Dependencies & Manifest Inspector'}
                        description={activeLocale === 'es' ? 'Auditoría detallada de dependencias runtime y dev con especificaciones de entorno.' : 'Deep inspection of runtime and development dependencies across project manifests.'}
                        locale={activeLocale}
                        onUpgraded={setSession}
                      />
                    ) : (
                      <div className="manifest-accordion">
                        {(report.manifests || []).map((manifest) => (
                          <div key={manifest.path} className="manifest-card">
                            <div className="manifest-header">
                              <span className="manifest-title">
                                <Code2 size={13} style={{ color: 'var(--accent-cyan)' }} />
                                {manifest.path}
                              </span>
                              <span className="ecosystem-badge">{manifest.ecosystem}</span>
                            </div>

                            {(manifest.runtimeRequirements?.length || 0) > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {(manifest.runtimeRequirements || []).map((req, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: 11,
                                      padding: '2px 7px',
                                      borderRadius: 'var(--radius-sm)',
                                      background: 'rgba(56, 189, 248, 0.1)',
                                      color: 'var(--accent-cyan)',
                                      border: '1px solid rgba(56, 189, 248, 0.25)',
                                    }}
                                  >
                                    {req.runtime}: {req.requirement}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="dep-pills-wrap">
                              {(manifest.dependencies || []).map((dep) => (
                                <span
                                  key={dep.name}
                                  className={`dep-pill ${dep.kind === 'runtime' ? 'runtime' : ''}`}
                                >
                                  {dep.name} <span style={{ opacity: 0.65 }}>{dep.requirement}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="insight-card">
                      <p className="insight-text" style={{ color: 'var(--text-muted)' }}>
                        {activeLocale === 'es' ? 'Módulo de dependencias desactivado por el administrador.' : 'Dependencies module disabled by administrator.'}
                      </p>
                    </div>
                  )
                )}

                {reportSection === 'files' && (
                  fileAccess !== 'disabled' ? (
                    fileAccess === 'pro' && !isPro ? (
                      <ProFeatureGateCard
                        moduleName={activeLocale === 'es' ? 'Explorador de Archivos Clave' : 'Key Files Explorer'}
                        description={activeLocale === 'es' ? 'Navegación por el árbol de código fuente y archivos críticos de arquitectura.' : 'Navigate through the source tree and critical architecture files.'}
                        locale={activeLocale}
                        onUpgraded={setSession}
                      />
                    ) : (
                      <DirectoryTree
                        entries={report.tree && report.tree.length > 0 ? report.tree : report.importantFiles || []}
                        repoHtmlUrl={report.repository.htmlUrl}
                        defaultBranch={report.repository.defaultBranch || 'main'}
                        locale={activeLocale}
                      />
                    )
                  ) : (
                    <div className="insight-card">
                      <p className="insight-text" style={{ color: 'var(--text-muted)' }}>
                        {activeLocale === 'es' ? 'Módulo de archivos desactivado por el administrador.' : 'Files module disabled by administrator.'}
                      </p>
                    </div>
                  )
                )}

                {reportSection === 'releases' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {report.latestRelease ? (
                      <div className="insight-card">
                        <div className="insight-title" style={{ color: 'var(--text-primary)' }}>
                          <Tag size={13} style={{ color: 'var(--accent-emerald)' }} />
                          <span>Release {report.latestRelease.tagName}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Publicado el {new Date(report.latestRelease.publishedAt || '').toLocaleDateString()}
                        </p>
                        {(report.latestRelease.assets?.length || 0) > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                              Archivos de descarga:
                            </span>
                            {report.latestRelease.assets.map((asset) => (
                              <a
                                key={asset.name}
                                href={asset.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: 12,
                                  color: 'var(--accent-cyan)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  textDecoration: 'none',
                                }}
                              >
                                <Download size={12} />
                                <span>{asset.name}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                  ({(asset.size / (1024 * 1024)).toFixed(1)} MB)
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No hay releases oficiales en este repositorio.</div>
                    )}
                  </div>
                )}

                {reportSection === 'sources' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(report.sources || []).map((src) => (
                      <div
                        key={src.label}
                        style={{
                          padding: '8px 10px',
                          background: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{src.label}</span>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          Ver endpoint <ExternalLink size={11} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* VIEW 2: SAVED REPORTS */}
        {nav === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(!savedReports || savedReports.length === 0) ? (
              <div className="ext-empty-state">
                <FolderGit2 size={32} />
                <div className="empty-title">{t('no_reports_yet', activeLocale)}</div>
                <div className="empty-desc">{t('no_reports_yet_desc', activeLocale)}</div>
              </div>
            ) : (
              savedReports.map((item) => {
                const colloquial = generateColloquialSpanishSummary(item, activeLocale)
                return (
                  <div
                    key={item.repository?.fullName || Math.random().toString()}
                    className="insight-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setReport(item)
                      setNav('analyze')
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        {item.repository?.fullName || 'Repositorio'}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="ext-btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (item.repository?.fullName) void handleDeleteReport(item.repository.fullName)
                          }}
                          title={activeLocale === 'es' ? 'Eliminar reporte' : 'Delete report'}
                        >
                          <Trash2 size={13} style={{ color: 'var(--accent-rose)' }} />
                        </button>
                      </div>
                    </div>

                    <TranslatedDescription
                      rawText={item.repository?.description}
                      fallback={colloquial.shortDescription || colloquial.whatItIs}
                      locale={activeLocale}
                    />

                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                      <span>⭐ {item.repository?.stars?.toLocaleString() || 0}</span>
                      <span>📦 {item.dependencies?.length || 0} deps</span>
                      <span>🕒 {item.analyzedAt ? new Date(item.analyzedAt).toLocaleDateString() : (activeLocale === 'es' ? 'Reciente' : 'Recent')}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* VIEW 3: COMPARE */}
        {nav === 'compare' && (
          <CompareView reports={savedReports || []} currentReport={report} locale={activeLocale} />
        )}

        {/* VIEW 4: FAVORITES */}
        {nav === 'favorites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(!favorites || favorites.length === 0) ? (
              <div className="ext-empty-state">
                <Star size={32} />
                <div className="empty-title">{t('no_favs_yet', activeLocale)}</div>
                <div className="empty-desc">{t('no_favs_yet_desc', activeLocale)}</div>
              </div>
            ) : (
              favorites.map((fav) => (
                <div
                  key={fav.fullName}
                  className="insight-card"
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onClick={() => {
                    void performAnalysis(`https://github.com/${fav.fullName}`)
                    setNav('analyze')
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Star size={13} fill="var(--accent-amber)" color="var(--accent-amber)" />
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        {fav.fullName}
                      </span>
                      {fav.primaryLanguage && (
                        <span className="colloquial-chip" style={{ fontSize: 10, padding: '1px 6px' }}>
                          {fav.primaryLanguage}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {fav.stars > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ⭐ {fav.stars.toLocaleString()}
                        </span>
                      )}
                      <button
                        type="button"
                        className="ext-btn-icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleToggleFavorite(fav.fullName)
                        }}
                        title={activeLocale === 'es' ? 'Quitar de favoritos' : 'Remove from favorites'}
                      >
                        <Trash2 size={13} style={{ color: 'var(--accent-rose)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Descripción traducida al idioma activo */}
                  <TranslatedDescription
                    rawText={fav.descriptionEs}
                    fallback={activeLocale === 'es' ? 'Repositorio guardado en tus favoritos.' : 'Repository saved to favorites.'}
                    locale={activeLocale}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {/* VIEW 5: SETTINGS */}
        {nav === 'settings' && (
          <SettingsView
            preferences={preferences}
            locale={activeLocale}
            onSavePreferences={async (prefs) => {
              const updated = await saveStoredPreferences(prefs)
              setPreferences(updated)
              document.documentElement.setAttribute('data-theme', updated.theme === 'system' ? 'dark' : updated.theme)
            }}
            onClearCache={async () => {
              await clearLocalIntelligenceCache()
              for (const r of savedReports) {
                await deleteSavedReport(r.repository.fullName)
              }
              setSavedReports([])
              setReport(null)
            }}
          />
        )}
      </div>

      {/* Footer Bar */}
      {report && nav === 'analyze' && (
        <footer className="ext-footer-bar">
          <div className="footer-btn-group">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCopyMarkdown}
              title={activeLocale === 'es' ? 'Copiar reporte en formato Markdown' : 'Copy report in Markdown format'}
            >
              {copiedMd ? <Check size={13} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={13} />}
              <span>{copiedMd ? t('copied_markdown', activeLocale) : t('copy_markdown', activeLocale)}</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleExportDownload('markdown')}
              title={activeLocale === 'es' ? 'Descargar archivo .md' : 'Download .md file'}
            >
              <Download size={13} />
              <span>{activeLocale === 'es' ? 'Descargar .md' : 'Download .md'}</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleExportDownload('json')}
              title={activeLocale === 'es' ? 'Descargar archivo .json' : 'Download .json file'}
            >
              <Download size={13} />
              <span>JSON</span>
            </button>
          </div>

          <a
            href={report.repository.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
            style={{ color: 'var(--accent-cyan)' }}
          >
            <span>GitHub</span>
            <ExternalLink size={12} />
          </a>
        </footer>
      )}
    </div>
  )
}
