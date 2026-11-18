import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Sparkles,
  ExternalLink,
  Copy,
  Star,
  Check,
  RefreshCw,
  Search,
  Layers,
  ArrowRight,
  PanelRight,
  Cpu,
  Terminal,
  KeyRound,
  AlertCircle,
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
  isDailyQuotaExceeded,
  markDailyQuotaExceeded,
  sanitizeCommitRef,
  type RemoteConfig,
} from '../api/backendClient'
import { createReportExport } from '../../features/repository/export'
import {
  getStoredPreferences,
  saveStoredPreferences,
  getStoredFavorites,
  toggleStoredFavorite,
  addStoredRecent,
  getCachedReport,
  saveCachedReport,
  type ExtensionPreferences,
  DEFAULT_EXTENSION_PREFERENCES,
} from '../storage'
import { LanguageBar } from '../components/LanguageBar'
import { RateLimitGauge } from '../components/RateLimitGauge'
import { detectSystemHardware, evaluateHardwareCompatibility, type HardwareInfo } from '../hardware'
import { HardwareCompatibilityCard } from '../components/HardwareCompatibilityCard'
import { ColloquialSummaryCard } from '../components/ColloquialSummaryCard'
import { RoadmapView } from '../components/RoadmapView'
import { SettingsView } from '../components/SettingsView'
import { classifySummaryError, generateColloquialSpanishSummary } from '../spanishSummary'
import { resolveActiveLanguage, t } from '../i18n'
import { EditorLaunchButtons } from '../components/EditorLaunchButtons'
import { RepoHealthCard } from '../components/RepoHealthCard'
import { ArchitectureDiagramView } from '../components/ArchitectureDiagramView'
import { PackageInstallCommand } from '../components/PackageInstallCommand'
import { ApiErrorCard } from '../components/ApiErrorCard'
import { ExtHeaderBrand } from '../components/ExtHeaderBrand'
import { RepoHeroCard } from '../components/RepoHeroCard'
import { AnalysisMascot } from '../components/AnalysisMascot'
import { InteractiveBeamLoader } from '../components/InteractiveBeamLoader'
import { QuotaExceededCard } from '../components/QuotaExceededCard'

const QUICK_SUGGESTIONS = [
  { name: 'facebook/react', url: 'https://github.com/facebook/react', tag: 'UI Library' },
  { name: 'tauri-apps/tauri', url: 'https://github.com/tauri-apps/tauri', tag: 'Rust · Desktop' },
  { name: 'vitejs/vite', url: 'https://github.com/vitejs/vite', tag: 'Frontend Tooling' },
  { name: 'astral-sh/uv', url: 'https://github.com/astral-sh/uv', tag: 'Fast Python' },
]

export function PopupApp() {
  const [preferences, setPreferences] = useState<ExtensionPreferences>(DEFAULT_EXTENSION_PREFERENCES)
  const activeLocale = resolveActiveLanguage(preferences.language)
  const [activeTabRepo, setActiveTabRepo] = useState<GitHubTarget | null>(null)
  const [, setActiveTabUrl] = useState<string>('')
  const [dismissedDetectedRepo, setDismissedDetectedRepo] = useState<string | null>(null)
  const [searchUrl, setSearchUrl] = useState<string>('')
  const [report, setReport] = useState<RepositoryReport | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedMd, setCopiedMd] = useState<boolean>(false)
  const [isFavorite, setIsFavorite] = useState<boolean>(false)
  const [activeSubTab, setActiveSubTab] = useState<'hardware' | 'roadmap' | 'details' | null>(null)
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null)
  const [refreshNonce, setRefreshNonce] = useState<number>(0)
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightUrlRef = useRef<string | null>(null)

  // Detect system hardware and remote config on mount
  useEffect(() => {
    void detectSystemHardware().then(setHardware)
    void fetchRemoteConfig().then(setRemoteConfig).catch(() => {})
  }, [])

  const compat = useMemo(() => {
    if (!hardware || !report) return null
    return evaluateHardwareCompatibility(hardware, report)
  }, [hardware, report])

  const performAnalysis = useCallback(async (urlToAnalyze: string, force = false) => {
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
    setSearchUrl(target.originalUrl)
    setActiveTabRepo(target)

    // If an analysis for this exact repository is already in flight, do not duplicate or abort it
    if (inFlightUrlRef.current === target.originalUrl && !force) {
      return
    }

    // Check cache first if not forced
    if (!force) {
      const cached = await getCachedReport(target.originalUrl)
      if (cached) {
        setReport(cached)
        setQuotaExceeded(false)
        return
      }
    }

    // Pre-check if daily free quota was already exceeded today
    const quotaExceededToday = await isDailyQuotaExceeded()
    if (quotaExceededToday) {
      setReport(null)
      setQuotaExceeded(true)
      setLoading(false)
      setError(null)
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller
    inFlightUrlRef.current = target.originalUrl

    // Clear previous report so that InteractiveBeamLoader is immediately visible
    setReport(null)
    setLoading(true)
    setQuotaExceeded(false)
    try {
      // 1. Fetch GitHub metadata, commits, tree and manifests
      const res = await analyzeGitHubRepository(target, controller.signal)

      // 2. Await AI intelligence so loading animation remains active until all data is ready
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
        res.aiAnalysis = aiAnalysis
      } catch (aiErr: unknown) {
        const summaryErr = classifySummaryError(aiErr)
        if (summaryErr.quotaExceeded) {
          await markDailyQuotaExceeded()
          setReport(null)
          setQuotaExceeded(true)
          return
        }
        console.warn('AI analysis skipped/failed:', aiErr)
      }

      if (force) {
        setRefreshNonce((n) => n + 1)
      }
      setReport(res)
      setQuotaExceeded(false)
      try {
        await saveCachedReport(res)
        await addStoredRecent(res)
      } catch (cacheErr) {
        console.warn('Could not cache report locally:', cacheErr)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al analizar el repositorio.')
    } finally {
      if (inFlightUrlRef.current === target.originalUrl) {
        inFlightUrlRef.current = null
      }
      setLoading(false)
    }
  }, [])

  // Load preferences and detect active tab repository
  useEffect(() => {
    void getStoredPreferences().then((prefs) => {
      setPreferences(prefs)
      document.documentElement.setAttribute('data-theme', prefs.theme === 'system' ? 'dark' : prefs.theme)
    })

    const inspectUrl = (url: string, isInitial = false) => {
      setActiveTabUrl(url)
      try {
        const target = parseFlexibleGitHubUrl(url)
        setActiveTabRepo(target)
        if (isInitial) {
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
            setSearchUrl(pending.originalUrl)
            setActiveTabRepo(pending)
            void performAnalysis(pending.originalUrl, false)
            return true
          }
        } catch {
          // Ignore
        }
      }
      return false
    }

    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      ;(async () => {
        const hadPending = await checkPendingAnalysis()
        if (hadPending) return
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab?.url) inspectUrl(tab.url, true)
        } catch {
          // Ignore
        }
      })()

      // Listen for live messages
      const onMessage = (msg: { type: string; target?: GitHubTarget }) => {
        if (msg?.type === 'TRIGGER_ANALYSIS' && msg.target?.originalUrl) {
          setSearchUrl(msg.target.originalUrl)
          setActiveTabRepo(msg.target)
          void performAnalysis(msg.target.originalUrl, false)
        }
      }

      // Listen for storage changes in case gpi_pending_analysis arrives
      const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' && changes.gpi_pending_analysis?.newValue) {
          const pending = changes.gpi_pending_analysis.newValue as GitHubTarget
          chrome.storage.local.remove('gpi_pending_analysis').catch(() => {})
          setSearchUrl(pending.originalUrl)
          setActiveTabRepo(pending)
          void performAnalysis(pending.originalUrl, false)
        }
      }

      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(onMessage)
      }
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(onStorageChange)
      }

      // Listen for tab switching and URL updates in real time
      const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId)
          if (tab?.url) inspectUrl(tab.url, false)
        } catch {
          // Ignore
        }
      }
      const onUpdated = async (tabId: number, changeInfo: { status?: string; url?: string }) => {
        if (changeInfo.url) {
          try {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (currentTab?.id === tabId && currentTab?.url) {
              inspectUrl(currentTab.url, false)
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
  }, [performAnalysis])

  // Check if current report is in favorites
  useEffect(() => {
    if (report) {
      ;(async () => {
        const favs = await getStoredFavorites()
        setIsFavorite(favs.some((f) => f.fullName.toLowerCase() === report.repository.fullName.toLowerCase()))
      })()
    }
  }, [report])

  const handleToggleFav = async () => {
    if (!report) return
    const summary = generateColloquialSpanishSummary(report, activeLocale)
    const nextState = await toggleStoredFavorite({
      fullName: report.repository.fullName,
      url: report.repository.htmlUrl,
      descriptionEs: summary.shortDescription || summary.whatItIs,
      stars: report.repository.stars,
      primaryLanguage: report.languages[0]?.name || 'Código',
    })
    setIsFavorite(nextState)
  }

  const handleCopyMarkdown = async () => {
    if (!report) return
    try {
      const md = createReportExport(report, 'markdown')
      await navigator.clipboard.writeText(md.contents)
      setCopiedMd(true)
      setTimeout(() => setCopiedMd(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleOpenSidePanel = async () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel?.open) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId })
          window.close()
          return
        }
        if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id })
          window.close()
          return
        }
      } catch (err) {
        console.warn('sidePanel.open falló, usando fallback:', err)
      }
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      window.open(chrome.runtime.getURL('sidepanel.html'), '_blank')
    }
  }

  const handleThemeToggle = () => {
    const nextTheme = preferences.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', nextTheme)
    void saveStoredPreferences({ theme: nextTheme }).then(setPreferences)
  }

  return (
    <div className="extension-popup-container">
      {/* Header */}
      <header className="ext-header">
        <ExtHeaderBrand tag="v1.0" />

        <div className="ext-header-actions">
          <div
            onClick={() => setShowSettingsModal(true)}
            style={{ cursor: 'pointer' }}
            title={activeLocale === 'es' ? 'Estado de GitHub Token (clic para configurar)' : 'GitHub Token status (click to configure)'}
          >
            <RateLimitGauge
              hasToken={Boolean(preferences.githubToken)}
              locale={activeLocale}
            />
          </div>

          <button
            type="button"
            className="btn-open-sidepanel"
            onClick={handleOpenSidePanel}
            title={t('open_sidepanel_full', activeLocale)}
            aria-label={t('open_sidepanel_full', activeLocale)}
          >
            <PanelRight size={13} />
            <span>{t('open_sidepanel', activeLocale)}</span>
          </button>

          <button
            type="button"
            className={`ext-btn-icon ${showSearch ? 'active' : ''}`}
            onClick={() => setShowSearch((prev) => !prev)}
            title={t('search_another', activeLocale)}
            aria-label={t('search_another', activeLocale)}
          >
            <Search size={14} />
          </button>

          <button
            type="button"
            className={`ext-btn-icon ${showSettingsModal ? 'active' : ''}`}
            onClick={() => setShowSettingsModal((prev) => !prev)}
            title={t('settings', activeLocale)}
            aria-label={t('settings', activeLocale)}
          >
            <KeyRound size={14} />
          </button>

          <button
            type="button"
            className="ext-btn-icon"
            onClick={handleThemeToggle}
            title={t('toggle_theme', activeLocale)}
            aria-label={t('toggle_theme', activeLocale)}
          >
            <Sparkles size={14} />
          </button>
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

      {/* API Token Alert Banner if no token configured */}
      {!preferences.githubToken && (
        <div className="ext-api-alert-banner">
          <div className="ext-api-alert-content">
            <AlertCircle size={14} className="ext-api-alert-icon" />
            <div className="ext-api-alert-text">
              <strong>{t('rate_limit_alert_title', activeLocale)}</strong> {t('rate_limit_alert_desc', activeLocale)}
            </div>
          </div>
          <button
            type="button"
            className="ext-api-alert-btn"
            onClick={() => setShowSettingsModal(true)}
          >
            <KeyRound size={11} />
            <span>{t('rate_limit_alert_btn', activeLocale)}</span>
          </button>
        </div>
      )}

      {/* 1. Nuevo repositorio detectado al cambiar de pestaña */}
      {activeTabRepo && report && `${activeTabRepo.owner}/${activeTabRepo.repository}`.toLowerCase() !== (report.repository?.fullName || '').toLowerCase() && dismissedDetectedRepo !== activeTabRepo.originalUrl ? (
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
      ) : activeTabRepo ? (
        /* 2. Banner normal de pestaña actual */
        <div className="ext-detection-banner">
          <div className="ext-detection-left">
            <span className="pulse-dot" />
            <span className="ext-detection-text">
              {t('detected_in_tab', activeLocale)}{' '}
              <span className="ext-detection-repo">{activeTabRepo.owner}/{activeTabRepo.repository}</span>
            </span>
          </div>
          <button
            type="button"
            className="ext-btn-icon"
            onClick={() => void performAnalysis(activeTabRepo.originalUrl, true)}
            title={t('reload_analysis', activeLocale)}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      ) : null}

      {/* Quick Search Card */}
      {((!activeTabRepo && !report) || showSearch) && (
        <div className="ext-search-card">
          <form
            className="ext-search-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (searchUrl.trim()) {
                void performAnalysis(searchUrl.trim())
                setShowSearch(false)
              }
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="ext-search-input"
              placeholder={t('search_placeholder', activeLocale)}
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
            />
            <button type="submit" className="ext-search-btn" disabled={loading || !searchUrl.trim()}>
              {loading ? <RefreshCw size={12} className="animate-spin" /> : t('analyze_btn', activeLocale)}
            </button>
          </form>
        </div>
      )}

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="ext-settings-modal-overlay">
          <div className="ext-settings-modal-card">
            <div className="ext-settings-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <KeyRound size={15} style={{ color: 'var(--accent-cyan)' }} />
                <span>{t('settings_title', activeLocale)}</span>
              </div>
              <button
                type="button"
                className="ext-btn-icon"
                onClick={() => setShowSettingsModal(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="ext-settings-modal-body">
              <SettingsView
                preferences={preferences}
                locale={activeLocale}
                onSavePreferences={async (prefs) => {
                  const updated = await saveStoredPreferences(prefs)
                  setPreferences(updated)
                }}
                onClearCache={async () => {
                  await clearLocalIntelligenceCache()
                  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                    await chrome.storage.local.remove(['gpi_reports', 'gpi_recent'])
                  } else {
                    localStorage.removeItem('gpi_reports')
                    localStorage.removeItem('gpi_recent')
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Body Area */}
      <div className="ext-body">
        {loading && !report && (
          <InteractiveBeamLoader
            repoName={activeTabRepo ? `${activeTabRepo.owner}/${activeTabRepo.repository}` : (searchUrl || undefined)}
            locale={activeLocale}
          />
        )}

        {quotaExceeded && !loading && (
          <QuotaExceededCard
            locale={activeLocale}
            repoName={activeTabRepo ? `${activeTabRepo.owner}/${activeTabRepo.repository}` : (searchUrl || undefined)}
            onProVerified={() => {
              setQuotaExceeded(false)
              void performAnalysis(activeTabRepo?.originalUrl || searchUrl, true)
            }}
          />
        )}

        {error && !quotaExceeded && (
          <ApiErrorCard
            error={error}
            locale={activeLocale}
            onOpenSettings={() => setShowSettingsModal(true)}
            onRetry={() => {
              if (activeTabRepo) {
                void performAnalysis(activeTabRepo.originalUrl, true)
              }
            }}
            onDismiss={() => setError(null)}
          />
        )}

        {!loading && !report && !error && !activeTabRepo && !quotaExceeded && (
          <div className="ext-empty-state">
            <AnalysisMascot moodOverride="neutral" size={72} />
            <div className="empty-title" style={{ marginTop: 8 }}>{t('not_in_github', activeLocale)}</div>
            <div className="empty-desc">
              {t('not_in_github_desc', activeLocale)}
            </div>

            <div className="quick-repos-grid">
              {QUICK_SUGGESTIONS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="quick-repo-btn"
                  onClick={() => {
                    setSearchUrl(item.url)
                    void performAnalysis(item.url)
                  }}
                >
                  <span className="quick-repo-name">{item.name}</span>
                  <span className="quick-repo-tag">{item.tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {report && !quotaExceeded && (
          <>
            {/* 1. MÓDULO HERO PRINCIPAL DE MARCA CON MASCOTA REACTIVA */}
            <RepoHeroCard report={report} locale={activeLocale} />

            {/* Contenedor de Detalles y Acciones Rápidas */}
            <div className="repo-hero-integrated-card" style={{ marginTop: 10 }}>
              {/* Explicación del Repo Integrada Aquí Mismo */}
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

              {/* 📦 Comando de Instalación en 1-Clic */}
              <div style={{ marginTop: 6 }}>
                <PackageInstallCommand report={report} locale={activeLocale} />
              </div>

              {/* ⚡ 2. Clonado y Apertura en 1 Clic en tu Editor / Sandbox en la Nube */}
              <div style={{ marginTop: 6 }}>
                <EditorLaunchButtons repoUrl={report.repository.htmlUrl} fullName={report.repository.fullName} locale={activeLocale} />
              </div>
            </div>

            {/* Selector de Vistas Secundarias (Tu PC, Instalación, Detalles) */}
            <div className="secondary-nav-chips">
              <button
                type="button"
                className={`secondary-nav-btn ${activeSubTab === 'hardware' ? 'active' : ''}`}
                onClick={() => setActiveSubTab((prev) => (prev === 'hardware' ? null : 'hardware'))}
              >
                <Cpu size={13} />
                <span>{t('tab_pc_compat', activeLocale)}</span>
                {compat && (
                  <span className={`mini-status-dot ${compat.status}`} />
                )}
              </button>

              <button
                type="button"
                className={`secondary-nav-btn ${activeSubTab === 'roadmap' ? 'active' : ''}`}
                onClick={() => setActiveSubTab((prev) => (prev === 'roadmap' ? null : 'roadmap'))}
              >
                <Terminal size={13} />
                <span>{t('tab_install', activeLocale)}</span>
              </button>

              <button
                type="button"
                className={`secondary-nav-btn ${activeSubTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveSubTab((prev) => (prev === 'details' ? null : 'details'))}
              >
                <Layers size={13} />
                <span>{t('tab_details', activeLocale)}</span>
              </button>
            </div>

            {/* Módulo Desplegable: Compatibilidad con tu PC */}
            {activeSubTab === 'hardware' && (
              <div className="subtab-view-container animate-fade-in">
                <HardwareCompatibilityCard hardware={hardware} compat={compat} locale={activeLocale} />
              </div>
            )}

            {/* Módulo Desplegable: Roadmap de Instalación */}
            {activeSubTab === 'roadmap' && (
              <div className="subtab-view-container animate-fade-in">
                <RoadmapView report={report} hardware={hardware} locale={activeLocale} />
              </div>
            )}

            {/* Módulo Desplegable: Detalles Técnicos & Lenguajes */}
            {activeSubTab === 'details' && (
              <div className="subtab-view-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 📊 4. Diagrama Visual de Arquitectura Pro & Auditoría Profunda */}
                <ArchitectureDiagramView
                  report={report}
                  locale={activeLocale}
                  diagramsEnabled={remoteConfig?.featureFlags.enableDiagrams}
                  onQuotaExceeded={() => {
                    setQuotaExceeded(true)
                    setReport(null)
                  }}
                />

                {/* 🩺 3. Índice de Salud & Actividad Detallado */}
                <RepoHealthCard report={report} locale={activeLocale} />

                <div className="modern-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    {activeLocale === 'es' ? 'Lenguajes de Programación' : 'Programming Languages'}
                  </div>
                  <LanguageBar languages={report.languages} />
                </div>

                <div className="modern-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                    {activeLocale === 'es' ? 'Stack & Arquitectura Técnica' : 'Stack & Technical Architecture'}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {report.technicalSummary}
                  </p>
                </div>

                {report.latestCommit && (
                  <div className="modern-card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {activeLocale === 'es' ? 'Último Commit' : 'Latest Commit'}
                      </div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 2 }}>
                        {(report.latestCommit.sha || '').slice(0, 7)} — {(report.latestCommit.message || '').split('\n')[0]?.slice(0, 36) || ''}...
                      </div>
                    </div>
                    <a
                      href={report.latestCommit.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent-cyan)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}
                    >
                      {activeLocale === 'es' ? 'Ver' : 'View'} <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Botón Superpuesto con Difuminado en la Parte Inferior: "Ver análisis completo" */}
      {report && (
        <div className="ext-floating-blur-bar">
          <button
            type="button"
            className="btn-ver-analisis-completo"
            onClick={handleOpenSidePanel}
            title={activeLocale === 'es' ? 'Abrir el panel lateral completo con explorador de archivos, dependencias y comparador' : 'Open full side panel with file explorer, dependencies and comparator'}
          >
            <PanelRight size={15} />
            <span>{t('view_full_analysis', activeLocale)}</span>
            <ArrowRight size={14} className="floating-arrow-icon" />
          </button>
        </div>
      )}

      {/* Footer Actions Bar */}
      {report && (
        <footer className="ext-footer-bar">
          <div className="footer-btn-group">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleToggleFav}
              title={isFavorite ? (activeLocale === 'es' ? 'Eliminar de favoritos' : 'Remove from favorites') : (activeLocale === 'es' ? 'Guardar en favoritos' : 'Save to favorites')}
              style={{ color: isFavorite ? 'var(--accent-amber)' : undefined }}
            >
              <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
              <span>{isFavorite ? t('saved_favorite', activeLocale) : t('save_favorite', activeLocale)}</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleCopyMarkdown}
              title={activeLocale === 'es' ? 'Copiar reporte completo en Markdown' : 'Copy complete report in Markdown'}
            >
              {copiedMd ? <Check size={13} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={13} />}
              <span>{copiedMd ? t('copied_markdown', activeLocale) : t('copy_markdown', activeLocale)}</span>
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
