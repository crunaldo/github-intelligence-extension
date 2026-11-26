import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  Palette,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Sparkles,
  ExternalLink,
  Zap,
  FolderTree,
  Settings,
  Pin,
  PinOff,
  ArrowLeft,
  ArrowRight,
  Check,
  Tag,
  GitPullRequest,
  GitCommit,
} from 'lucide-react'
import type { TreeEntry } from '../../features/repository/types'
import { classifyFile, getFileIcon } from '../utils/fileClassifier'
import { FileAiExplainerPopover } from './FileAiExplainerPopover'
import type { CodeTreePreferences } from '../storage'
import { DEFAULT_CODE_TREE_PREFERENCES, saveStoredPreferences, getStoredGitHubToken } from '../storage'
import { fetchRemoteConfig, type CampaignBannerItem } from '../api/backendClient'
import {
  parsePrOrCommitUrl,
  resolvePrOrCommitFiles,
  type PrFileEntry,
  type PrOrCommitResolution,
} from '../utils/prCommitResolver'
import {
  extractActivePathFromUrl,
  loadOpenFolders,
  saveOpenFolders,
  mergeActiveAncestors,
  fetchRepoGitTree,
} from '../utils/treePathSync'
import { t, resolveActiveLanguage, type AppLanguage, type ActiveLocale } from '../i18n'

export interface InPageCodeTreeDockProps {
  owner: string
  repo: string
  ref?: string
  initialEntries?: TreeEntry[]
  isAnalyzed?: boolean
  defaultOpen?: boolean
  isPro?: boolean
  vulnerableManifests?: string[]
  codeTreePreferences?: CodeTreePreferences
  language?: AppLanguage
  locale?: ActiveLocale
  onOpenSidepanel?: () => void
  onOpenSettings?: () => void
  onTriggerAnalysis?: () => void
  prOrCommitResolution?: PrOrCommitResolution | null
  targetUrl?: string
  enableLazyTreeFetch?: boolean
}

interface TreeNode {
  name: string
  path: string
  type: 'tree' | 'blob'
  size?: number | null
  children: Record<string, TreeNode>
}

const STORAGE_WIDTH_KEY = 'gpi_dock_width'
const STORAGE_OPEN_KEY = 'gpi_dock_is_open'
const DEFAULT_WIDTH = 320
const MIN_WIDTH = 240
const MAX_WIDTH = 600

export function InPageCodeTreeDock({
  owner,
  repo,
  ref = 'main',
  initialEntries = [],
  isAnalyzed = false,
  defaultOpen,
  isPro = false,
  vulnerableManifests = [],
  codeTreePreferences = DEFAULT_CODE_TREE_PREFERENCES,
  language,
  locale,
  onOpenSidepanel,
  onOpenSettings,
  onTriggerAnalysis,
  prOrCommitResolution,
  targetUrl,
  enableLazyTreeFetch = false,
}: InPageCodeTreeDockProps) {
  const [currentLang, setCurrentLang] = useState<AppLanguage | undefined>(language)

  useEffect(() => {
    if (language) {
      setCurrentLang(language)
    }
  }, [language])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes.gpi_preferences?.newValue) {
        const newPrefs = changes.gpi_preferences.newValue as { language?: AppLanguage }
        if (newPrefs?.language) {
          setCurrentLang(newPrefs.language)
        }
      }
    }

    try {
      chrome.storage.onChanged.addListener(handleStorageChange)
    } catch {
      // ignore in test or unsupported env
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(handleStorageChange)
      } catch {
        // ignore
      }
    }
  }, [])

  const activeLocale: ActiveLocale = locale || (currentLang ? resolveActiveLanguage(currentLang) : 'es')

  const [isOpen, setIsOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen
    try {
      const savedPin = sessionStorage.getItem('gpi_code_tree_pinned')
      if (savedPin === 'true') return true
      const sessionOpen = sessionStorage.getItem(STORAGE_OPEN_KEY)
      if (sessionOpen !== null) return sessionOpen === 'true'
      const localOpen = localStorage.getItem(STORAGE_OPEN_KEY)
      if (localOpen !== null) return localOpen === 'true'
    } catch {
      // fallback
    }
    return false
  })

  const [isPinned, setIsPinned] = useState(() => {
    try {
      const savedPin = sessionStorage.getItem('gpi_code_tree_pinned')
      if (savedPin !== null) return savedPin === 'true'
      const localPin = localStorage.getItem('gpi_code_tree_pinned')
      if (localPin !== null) return localPin === 'true'
    } catch {
      // fallback
    }
    return codeTreePreferences?.pinPerWindow ?? true
  })

  const [activeView, setActiveView] = useState<'tree' | 'settings'>('tree')
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WIDTH_KEY)
      if (saved) {
        const parsed = Number(saved)
        if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) return parsed
      }
    } catch {}
    return DEFAULT_WIDTH
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [currentUrl, setCurrentUrl] = useState(() =>
    targetUrl || (typeof window !== 'undefined' ? window.location.href : '')
  )

  useEffect(() => {
    if (targetUrl) {
      setCurrentUrl(targetUrl)
    }
  }, [targetUrl])

  // Real-time URL change detection across SPA / Turbo navigations
  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateUrl = () => {
      const href = window.location.href
      setCurrentUrl((prev) => (prev !== href ? href : prev))
    }
    window.addEventListener('popstate', updateUrl)
    document.addEventListener('turbo:load', updateUrl)
    document.addEventListener('turbo:render', updateUrl)
    document.addEventListener('pjax:end', updateUrl)

    const timer = setInterval(updateUrl, 300)
    return () => {
      window.removeEventListener('popstate', updateUrl)
      document.removeEventListener('turbo:load', updateUrl)
      document.removeEventListener('turbo:render', updateUrl)
      document.removeEventListener('pjax:end', updateUrl)
      clearInterval(timer)
    }
  }, [])

  const activePathInfo = useMemo(() => {
    return extractActivePathFromUrl(currentUrl, codeTreePreferences?.customEnterpriseDomains)
  }, [currentUrl, codeTreePreferences?.customEnterpriseDomains])

  const [activePath, setActivePath] = useState(() => activePathInfo.path)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() =>
    loadOpenFolders(owner, repo)
  )

  // Auto-expand ancestor directories of the active file and persist
  useEffect(() => {
    setActivePath(activePathInfo.path)
    if (activePathInfo.path) {
      setOpenFolders((prev) => {
        const next = mergeActiveAncestors(prev, activePathInfo.path)
        if (next !== prev) {
          saveOpenFolders(owner, repo, next)
          return next
        }
        return prev
      })
    }
  }, [activePathInfo.path, owner, repo])

  // Auto-scroll active file into view when activePath changes or dock is opened
  useEffect(() => {
    if (!isOpen || !activePath || typeof document === 'undefined') return
    const timer = setTimeout(() => {
      try {
        const activeEl = document.querySelector('.gpi-tree-row.is-active-item')
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      } catch {}
    }, 120)
    return () => clearTimeout(timer)
  }, [isOpen, activePath])

  // Lazy-fetch git tree from GitHub API if enableLazyTreeFetch is true and initialEntries is empty
  const [lazyEntries, setLazyEntries] = useState<TreeEntry[]>([])
  const [isLoadingTree, setIsLoadingTree] = useState(false)

  useEffect(() => {
    if (!enableLazyTreeFetch) return
    if (initialEntries && initialEntries.length > 0) {
      setLazyEntries(initialEntries)
      return
    }

    let isMounted = true
    setIsLoadingTree(true)

    getStoredGitHubToken()
      .then((token) => {
        return fetchRepoGitTree(
          owner,
          repo,
          ref,
          token,
          codeTreePreferences?.customEnterpriseDomains
        )
      })
      .then((entries) => {
        if (!isMounted) return
        if (entries && entries.length > 0) {
          setLazyEntries(entries)
        }
        setIsLoadingTree(false)
      })
      .catch(() => {
        if (isMounted) setIsLoadingTree(false)
      })

    return () => {
      isMounted = false
    }
  }, [owner, repo, ref, initialEntries, codeTreePreferences?.customEnterpriseDomains])

  const effectiveEntries = useMemo(() => {
    if (initialEntries && initialEntries.length > 0) return initialEntries
    return lazyEntries
  }, [initialEntries, lazyEntries])

  const [explainingFile, setExplainingFile] = useState<string | null>(null)
  const [popoverTop, setPopoverTop] = useState<number>(100)
  const [prResolution, setPrResolution] = useState<PrOrCommitResolution | null>(() => prOrCommitResolution || null)
  const [prViewTab, setPrViewTab] = useState<'pr' | 'tree'>('pr')
  const isResizingRef = useRef(false)

  // Resolve PR or Commit changed files when visiting a pull request or commit page
  useEffect(() => {
    if (prOrCommitResolution !== undefined) {
      setPrResolution(prOrCommitResolution)
      if (prOrCommitResolution && prOrCommitResolution.files.length > 0) {
        setPrViewTab('pr')
      }
      return
    }

    const currentUrl = targetUrl || (typeof window !== 'undefined' ? window.location.href : '')
    if (!currentUrl) return

    const target = parsePrOrCommitUrl(currentUrl, codeTreePreferences?.customEnterpriseDomains)
    if (
      target.isPrOrCommit &&
      target.owner?.toLowerCase() === owner.toLowerCase() &&
      target.repo?.toLowerCase() === repo.toLowerCase()
    ) {
      getStoredGitHubToken()
        .then((token) => {
          resolvePrOrCommitFiles(target, token)
            .then((res) => {
              if (res.isPrOrCommit && res.files.length > 0) {
                setPrResolution(res)
                setPrViewTab('pr')
              }
            })
            .catch(() => {})
        })
        .catch(() => {})
    } else {
      setPrResolution(null)
    }
  }, [owner, repo, targetUrl, prOrCommitResolution, codeTreePreferences?.customEnterpriseDomains])

  // Dynamic In-Dock Campaign Banners from Remote Config
  const [campaignBanners, setCampaignBanners] = useState<CampaignBannerItem[]>([])
  const [dismissedBannerIds, setDismissedBannerIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem('gpi_dismissed_banners')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [copiedCouponId, setCopiedCouponId] = useState<string | null>(null)

  useEffect(() => {
    fetchRemoteConfig()
      .then((cfg) => {
        if (cfg?.campaignBanners && cfg.campaignBanners.length > 0) {
          setCampaignBanners(cfg.campaignBanners)
        }
      })
      .catch(() => {})
  }, [])

  const activeBanner = useMemo(() => {
    if (!campaignBanners || campaignBanners.length === 0) return null
    const userTier = isPro ? 'pro' : 'free'
    return campaignBanners.find(
      (b) => b.enabled !== false && (b.targetTier === 'all' || b.targetTier === userTier) && !dismissedBannerIds[b.id]
    )
  }, [campaignBanners, isPro, dismissedBannerIds])

  // Load saved width & open state from chrome.storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_WIDTH_KEY, STORAGE_OPEN_KEY, 'gpi_code_tree_pinned'], (res) => {
        const saved = res?.[STORAGE_WIDTH_KEY]
        if (typeof saved === 'number' && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
          setWidth(saved)
        }
        if (typeof res?.['gpi_code_tree_pinned'] === 'boolean') {
          setIsPinned(res['gpi_code_tree_pinned'])
          if (res['gpi_code_tree_pinned']) {
            setIsOpen(true)
          }
        }
        if (typeof res?.[STORAGE_OPEN_KEY] === 'boolean' && !defaultOpen) {
          setIsOpen(res[STORAGE_OPEN_KEY])
        }
      })
    }
  }, [defaultOpen])

  const updateIsOpen = (next: boolean) => {
    setIsOpen(next)
    try {
      sessionStorage.setItem(STORAGE_OPEN_KEY, String(next))
      localStorage.setItem(STORAGE_OPEN_KEY, String(next))
    } catch {}
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_OPEN_KEY]: next }).catch(() => {})
    }
  }

  const updateIsPinned = (next: boolean) => {
    setIsPinned(next)
    try {
      sessionStorage.setItem('gpi_code_tree_pinned', String(next))
      localStorage.setItem('gpi_code_tree_pinned', String(next))
    } catch {}
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ gpi_code_tree_pinned: next }).catch(() => {})
    }
    if (next) {
      updateIsOpen(true)
    }
  }

  const toggleDock = (openState?: boolean) => {
    const next = typeof openState === 'boolean' ? openState : !isOpen
    updateIsOpen(next)
  }

  // Push GitHub page body when pinned like Octotree/IDE
  useEffect(() => {
    if (typeof document === 'undefined') return
    const isRight = codeTreePreferences?.tabPosition === 'right'

    if (isOpen && isPinned) {
      document.body.classList.add('gpi-dock-pinned')
      if (isRight) {
        document.body.style.marginRight = `${width}px`
        document.body.style.marginLeft = ''
      } else {
        document.body.style.marginLeft = `${width}px`
        document.body.style.marginRight = ''
      }
      document.body.style.transition = 'margin 0.2s ease'
    } else {
      document.body.classList.remove('gpi-dock-pinned')
      document.body.style.marginLeft = ''
      document.body.style.marginRight = ''
    }

    return () => {
      document.body.classList.remove('gpi-dock-pinned')
      document.body.style.marginLeft = ''
      document.body.style.marginRight = ''
    }
  }, [isOpen, isPinned, width, codeTreePreferences?.tabPosition])

  // Keyboard shortcut support (default: Alt+W or custom)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcutStr = (codeTreePreferences?.shortcut || 'Alt+W').toUpperCase()
      const altRequired = shortcutStr.includes('ALT')
      const ctrlRequired = shortcutStr.includes('CTRL')
      const shiftRequired = shortcutStr.includes('SHIFT')
      const targetKey = shortcutStr.replace(/ALT|CTRL|SHIFT|\+/g, '').trim()

      const matchAlt = altRequired ? e.altKey : !e.altKey
      const matchCtrl = ctrlRequired ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
      const matchShift = shiftRequired ? e.shiftKey : !e.shiftKey
      const matchKey = e.key.toUpperCase() === targetKey

      if (matchAlt && matchCtrl && matchShift && matchKey) {
        e.preventDefault()
        toggleDock()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [codeTreePreferences?.shortcut])

  // Mouse drag resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const isRight = codeTreePreferences?.tabPosition === 'right'
      const clientX = isRight ? window.innerWidth - e.clientX : e.clientX
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, clientX))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_WIDTH_KEY]: width }).catch(() => {})
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [width, codeTreePreferences?.tabPosition])

  // Hide when current URL matches blacklisted keywords
  const hidePatterns = useMemo(() => {
    return (codeTreePreferences?.hideWhenUrlMatches || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }, [codeTreePreferences?.hideWhenUrlMatches])

  const currentHref = typeof window !== 'undefined' ? window.location.href.toLowerCase() : ''
  const isHiddenByUrl = hidePatterns.some((pattern) => currentHref.includes(pattern))

  // Build tree from flat list
  const { treeRoot } = useMemo(() => {
    const root: Record<string, TreeNode> = {}
    const query = searchQuery.toLowerCase().trim()
    const valid = (effectiveEntries || []).filter((e) => Boolean(e?.path))

    valid.forEach((entry) => {
      const isMatch = !query || entry.path.toLowerCase().includes(query)
      if (query && !isMatch) return

      const parts = entry.path.split('/')
      let cur = root

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1
        const fullPath = parts.slice(0, index + 1).join('/')

        if (!cur[part]) {
          cur[part] = {
            name: part,
            path: fullPath,
            type: isLast ? entry.type : 'tree',
            size: isLast ? entry.size : null,
            children: {},
          }
        }
        cur = cur[part]!.children
      })
    })

    return { treeRoot: root }
  }, [effectiveEntries, searchQuery])

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => {
      const next = { ...prev, [path]: !prev[path] }
      saveOpenFolders(owner, repo, next)
      return next
    })
  }

  const toggleAll = (expand: boolean) => {
    if (!expand) {
      setOpenFolders({})
      saveOpenFolders(owner, repo, {})
      return
    }
    const all: Record<string, boolean> = {}
    const collect = (nodes: Record<string, TreeNode>) => {
      Object.values(nodes).forEach((n) => {
        if (n.type === 'tree' || Object.keys(n.children).length > 0) {
          all[n.path] = true
          collect(n.children)
        }
      })
    }
    collect(treeRoot)
    setOpenFolders(all)
    saveOpenFolders(owner, repo, all)
  }

  // Handle SPA navigation without closing or collapsing dock
  const handleFileClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    nodePath: string,
    fileUrl: string
  ) => {
    e.preventDefault()
    e.stopPropagation()

    // 1. Immediately highlight this file in real-time
    setActivePath(nodePath)

    // 2. Ensure all ancestors remain expanded and save to persistent storage
    setOpenFolders((prev) => {
      const next = mergeActiveAncestors(prev, nodePath)
      saveOpenFolders(owner, repo, next)
      return next
    })

    // 3. Always keep dock open across file navigation
    updateIsOpen(true)

    // 4. Trigger synthetic link click or Turbo.visit so GitHub navigates cleanly
    if (typeof window !== 'undefined') {
      const w = window as any
      if (w.Turbo && typeof w.Turbo.visit === 'function') {
        try {
          w.Turbo.visit(fileUrl)
          return
        } catch {}
      }
      const link = document.createElement('a')
      link.href = fileUrl
      link.setAttribute('data-turbo', 'true')
      link.setAttribute('data-turbo-frame', '_top')
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
  }

  if (codeTreePreferences?.enabled === false || isHiddenByUrl) {
    return null
  }

  const isRight = codeTreePreferences?.tabPosition === 'right'
  const verticalPos = codeTreePreferences?.tabVerticalPos ?? 20

  const renderNodes = (nodes: Record<string, TreeNode>, depth = 0) => {
    const sorted = Object.values(nodes).sort((a, b) => {
      const aIsDir = a.type === 'tree' || Object.keys(a.children).length > 0
      const bIsDir = b.type === 'tree' || Object.keys(b.children).length > 0
      if (aIsDir && !bIsDir) return -1
      if (!aIsDir && bIsDir) return 1
      return a.name.localeCompare(b.name)
    })

    return sorted.map((node) => {
      const isDir = node.type === 'tree' || Object.keys(node.children).length > 0
      const isFolderOpen = Boolean(searchQuery) || openFolders[node.path]
      const fileUrl = `https://github.com/${owner}/${repo}/blob/${ref}/${node.path}`

      if (isDir) {
        const isDirActive = activePath === node.path
        return (
          <div key={node.path}>
            <div
              className={`gpi-tree-row ${isDirActive ? 'is-active-item' : ''}`}
              style={{ paddingLeft: depth * 14 + 10 }}
              onClick={() => {
                if (codeTreePreferences?.openFoldersOnClick !== false) {
                  toggleFolder(node.path)
                }
              }}
              title={node.path}
            >
              <div className="gpi-tree-left">
                {isFolderOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {isFolderOpen ? (
                  <FolderOpen size={13} style={{ color: '#f59e0b' }} />
                ) : (
                  <Folder size={13} style={{ color: '#f59e0b' }} />
                )}
                <span className="gpi-tree-label">{node.name}</span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--gpi-text-muted)' }}>
                {Object.keys(node.children).length}
              </span>
            </div>
            {isFolderOpen && <div>{renderNodes(node.children, depth + 1)}</div>}
          </div>
        )
      }

      // File Row
      const badge = classifyFile(node.path, vulnerableManifests)
      const isExplainingThis = explainingFile === node.path
      const isActiveFile = activePath === node.path

      return (
        <div
          key={node.path}
          className={`gpi-tree-row ${isActiveFile ? 'is-active-item' : ''}`}
          style={{ paddingLeft: depth * 14 + 24 }}
          title={node.path}
        >
          <a
            href={fileUrl}
            className="gpi-tree-left"
            style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
            onClick={(e) => handleFileClick(e, node.path, fileUrl)}
          >
            {getFileIcon(node.name, codeTreePreferences.iconTheme || 'vscode')}
            <span className="gpi-tree-label">{node.name}</span>
            {badge.label && (
              <span
                className="gpi-tree-badge"
                style={{
                  color: badge.iconColor,
                  border: `1px solid ${badge.iconColor}33`,
                }}
              >
                {badge.label}
              </span>
            )}
          </a>

          <button
            type="button"
            className="gpi-ai-trigger-btn"
            title={t('dock_explain_file_ai', activeLocale)}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              setPopoverTop(rect.top)
              setExplainingFile(isExplainingThis ? null : node.path)
            }}
          >
            <Sparkles size={12} />
          </button>
        </div>
      )
    })
  }

  return (
    <div className={`gpi-dock-container ${isRight ? 'position-right' : ''}`}>
      {/* Prominent Glowing Toggle Tab Handle (Hidden when drawer is open so it never overlaps content) */}
      <div
        className={`gpi-toggle-tab ${isOpen ? 'is-hidden' : ''}`}
        style={{ top: `${verticalPos}vh` }}
        onClick={() => toggleDock()}
        onMouseEnter={() => {
          if (codeTreePreferences?.hoverToOpen && !isOpen) {
            toggleDock(true)
          }
        }}
        onMouseOver={() => {
          if (codeTreePreferences?.hoverToOpen && !isOpen) {
            toggleDock(true)
          }
        }}
        title={
          isOpen
            ? t('dock_toggle_tab_hide', activeLocale, { shortcut: codeTreePreferences?.shortcut || 'Alt+W' })
            : t('dock_toggle_tab_show', activeLocale, { shortcut: codeTreePreferences?.shortcut || 'Alt+W' })
        }
      >
        <FolderTree size={17} />
        <span className="gpi-tab-label">Tree</span>
        <span className="gpi-tab-pulse-dot" />
      </div>

      {/* Drawer */}
      <div
        className={`gpi-dock-drawer ${isOpen ? 'open' : 'closed'}`}
        style={{ width: `${width}px` }}
      >
        {/* Resize Border */}
        <div
          className="gpi-resize-handle"
          onMouseDown={(e) => {
            e.preventDefault()
            isResizingRef.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          title={t('dock_resize_title', activeLocale)}
        />

        {/* Header */}
        <div className="gpi-header">
          <div className="gpi-header-title">
            <span style={{ color: 'var(--gpi-accent)' }}>⚡</span>
            <span>{repo}</span>
            <span style={{ fontSize: 11, color: 'var(--gpi-text-muted)', fontWeight: 400 }}>
              @{ref}
            </span>
          </div>
          <div className="gpi-header-actions">
            {onOpenSidepanel && (
              <button
                type="button"
                className="gpi-btn-icon"
                onClick={onOpenSidepanel}
                title={t('dock_open_sidepanel', activeLocale)}
              >
                <ExternalLink size={13} />
              </button>
            )}
            <button
              type="button"
              className={`gpi-btn-icon ${isPinned ? 'is-active' : ''}`}
              onClick={() => updateIsPinned(!isPinned)}
              title={isPinned ? t('dock_unpin_title', activeLocale) : t('dock_pin_title', activeLocale)}
            >
              {isPinned ? <Pin size={13} style={{ fill: 'currentColor' }} /> : <PinOff size={13} />}
            </button>
            <button
              type="button"
              className={`gpi-btn-icon ${activeView === 'settings' ? 'is-active' : ''}`}
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings()
                } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_SETTINGS', target: 'codeTree' }).catch(() => {})
                }
                setActiveView((prev) => (prev === 'settings' ? 'tree' : 'settings'))
              }}
              title={t('dock_settings_title', activeLocale)}
            >
              <Settings size={13} />
            </button>
            {activeView === 'tree' && (
              <button
                type="button"
                className="gpi-btn-icon"
                onClick={() => toggleAll(!Object.values(openFolders).some(Boolean))}
                title={t('dock_toggle_all', activeLocale)}
              >
                <ChevronsUpDown size={13} />
              </button>
            )}
            <button
              type="button"
              className="gpi-btn-icon"
              onClick={() => toggleDock(false)}
              title={t('dock_close_title', activeLocale, { shortcut: codeTreePreferences?.shortcut || 'Alt+W' })}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Dynamic Campaign & Promotion Banner */}
        {activeBanner && (
          <div className="gpi-campaign-banner" role="complementary" aria-label="Aviso de Campaña">
            <button
              type="button"
              className="gpi-campaign-dismiss"
              onClick={() => {
                setDismissedBannerIds((prev) => {
                  const updated = { ...prev, [activeBanner.id]: true }
                  try {
                    sessionStorage.setItem('gpi_dismissed_banners', JSON.stringify(updated))
                  } catch {}
                  return updated
                })
              }}
              title="Ocultar aviso"
              aria-label="Cerrar aviso"
            >
              <X size={12} />
            </button>
            <div className="gpi-campaign-header">
              {activeBanner.badge && <span className="gpi-campaign-badge">{activeBanner.badge}</span>}
              <span className="gpi-campaign-title">{activeBanner.title}</span>
            </div>
            {activeBanner.message && <p className="gpi-campaign-desc">{activeBanner.message}</p>}
            <div className="gpi-campaign-actions">
              {activeBanner.couponCode ? (
                <button
                  type="button"
                  className="gpi-campaign-coupon"
                  onClick={() => {
                    void navigator.clipboard?.writeText(activeBanner.couponCode!)
                    setCopiedCouponId(activeBanner.id)
                    setTimeout(() => setCopiedCouponId(null), 2000)
                  }}
                  title="Copiar cupón"
                >
                  <Tag size={11} />
                  <span>{copiedCouponId === activeBanner.id ? '¡Copiado!' : activeBanner.couponCode}</span>
                  {copiedCouponId === activeBanner.id && <Check size={11} />}
                </button>
              ) : <div />}
              <a
                href={activeBanner.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gpi-campaign-cta"
                onClick={() => {
                  if (onOpenSidepanel && (activeBanner.ctaUrl.includes('pricing') || activeBanner.ctaUrl.includes('pro'))) {
                    onOpenSidepanel()
                  }
                }}
              >
                <span>{activeBanner.ctaText}</span>
                <ArrowRight size={11} />
              </a>
            </div>
          </div>
        )}

        {/* View Switching: In-Dock Settings vs Tree Content */}
        {activeView === 'settings' ? (
          <div className="gpi-dock-settings-view">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gpi-text)' }}>
                {t('dock_quick_settings_title', activeLocale)}
              </div>
              <button
                type="button"
                className="gpi-btn-icon"
                onClick={() => setActiveView('tree')}
                title={t('dock_back_to_tree', activeLocale)}
              >
                <ArrowLeft size={14} />
              </button>
            </div>

            {/* Pin per window */}
            <div className="gpi-dock-settings-row">
              <div>
                <div className="gpi-dock-settings-title">{t('code_tree_pin_per_window', activeLocale)}</div>
                <div className="gpi-dock-settings-desc">{t('code_tree_pin_per_window_desc', activeLocale)}</div>
              </div>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => updateIsPinned(e.target.checked)}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: 'var(--gpi-accent)' }}
              />
            </div>

            {/* Open folders on click */}
            <div className="gpi-dock-settings-row">
              <div>
                <div className="gpi-dock-settings-title">{t('code_tree_open_folders_click', activeLocale)}</div>
                <div className="gpi-dock-settings-desc">{t('code_tree_open_folders_click_desc', activeLocale)}</div>
              </div>
              <input
                type="checkbox"
                checked={codeTreePreferences?.openFoldersOnClick !== false}
                onChange={(e) => {
                  void saveStoredPreferences({
                    codeTree: { ...codeTreePreferences, openFoldersOnClick: e.target.checked },
                  })
                }}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: 'var(--gpi-accent)' }}
              />
            </div>

            {/* Hover to open */}
            <div className="gpi-dock-settings-row">
              <div>
                <div className="gpi-dock-settings-title">{t('code_tree_hover_to_open', activeLocale)}</div>
                <div className="gpi-dock-settings-desc">{t('code_tree_hover_to_open_desc', activeLocale)}</div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(codeTreePreferences?.hoverToOpen)}
                onChange={(e) => {
                  void saveStoredPreferences({
                    codeTree: { ...codeTreePreferences, hoverToOpen: e.target.checked },
                  })
                }}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: 'var(--gpi-accent)' }}
              />
            </div>

            {/* Position */}
            <div>
              <div className="gpi-dock-settings-title" style={{ marginBottom: 6 }}>{t('dock_screen_side', activeLocale)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {(['left', 'right'] as const).map((pos) => {
                  const isSelected = (codeTreePreferences?.tabPosition || 'left') === pos
                  return (
                    <button
                      key={pos}
                      type="button"
                      className={`gpi-dock-settings-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        void saveStoredPreferences({
                          codeTree: { ...codeTreePreferences, tabPosition: pos },
                        })
                      }}
                    >
                      {pos === 'left' ? t('code_tree_position_left', activeLocale) : t('code_tree_position_right', activeLocale)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Language Selection */}
            <div style={{ marginTop: 4 }}>
              <div className="gpi-dock-settings-title" style={{ marginBottom: 6 }}>
                {t('language_title', activeLocale)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  { key: 'auto' as AppLanguage, label: t('language_auto', activeLocale) },
                  { key: 'es' as AppLanguage, label: 'Español' },
                  { key: 'en' as AppLanguage, label: 'English' },
                ].map(({ key, label }) => {
                  const isSelected = (currentLang || 'auto') === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`gpi-dock-settings-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setCurrentLang(key)
                        void saveStoredPreferences({ language: key })
                      }}
                      style={{ fontSize: 11 }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Icon Theme */}
            <div style={{ marginTop: 4 }}>
              <div className="gpi-dock-settings-title" style={{ marginBottom: 6 }}>{t('dock_icon_theme', activeLocale)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {(['vscode', 'seti', 'github'] as const).map((th) => {
                  const isSelected = (codeTreePreferences?.iconTheme || 'vscode') === th
                  return (
                    <button
                      key={th}
                      type="button"
                      className={`gpi-dock-settings-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        void saveStoredPreferences({
                          codeTree: { ...codeTreePreferences, iconTheme: th },
                        })
                      }}
                      style={{ fontSize: 11 }}
                    >
                      {th === 'vscode' ? 'VS Code' : th === 'seti' ? 'Seti' : 'GitHub'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Code Font */}
            <div style={{ marginTop: 4 }}>
              <div className="gpi-dock-settings-title" style={{ marginBottom: 4 }}>{t('dock_code_font', activeLocale)}</div>
              <select
                value={codeTreePreferences?.codeFontFamily || 'default'}
                onChange={(e) => {
                  void saveStoredPreferences({
                    codeTree: { ...codeTreePreferences, codeFontFamily: e.target.value as any },
                  })
                }}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 4,
                  background: 'var(--gpi-bg)',
                  border: '1px solid var(--gpi-border)',
                  color: 'var(--gpi-text)',
                  fontSize: 11,
                }}
              >
                <option value="default">{t('dock_code_font_default', activeLocale)}</option>
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="cascadia">Cascadia Code</option>
                <option value="source-code">Source Code Pro</option>
              </select>
            </div>

            {/* Shortcut Info */}
            <div style={{ marginTop: 4 }}>
              <div className="gpi-dock-settings-title">{t('dock_keyboard_shortcut', activeLocale)}</div>
              <div className="gpi-dock-settings-desc">
                {activeLocale === 'es' ? (
                  <>Presiona <kbd style={{ background: 'var(--gpi-bg)', padding: '2px 5px', borderRadius: 4, border: '1px solid var(--gpi-border)' }}>{codeTreePreferences?.shortcut || 'Alt+W'}</kbd> para alternar el explorador.</>
                ) : (
                  <>Press <kbd style={{ background: 'var(--gpi-bg)', padding: '2px 5px', borderRadius: 4, border: '1px solid var(--gpi-border)' }}>{codeTreePreferences?.shortcut || 'Alt+W'}</kbd> to toggle explorer.</>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="gpi-dock-settings-btn primary"
                onClick={() => {
                  if (onOpenSettings) {
                    onOpenSettings()
                  } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_SETTINGS', target: 'codeTree' }).catch(() => {})
                  }
                }}
              >
                <ExternalLink size={12} />
                <span>{t('dock_open_sidepanel_settings', activeLocale)}</span>
              </button>
              <button
                type="button"
                className="gpi-dock-settings-btn"
                onClick={() => setActiveView('tree')}
              >
                <span>{t('dock_back_to_tree', activeLocale)}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* PR & Commit Mode Switcher */}
            {prResolution && prResolution.files.length > 0 && (
              <div className="gpi-mode-tabs">
                <button
                  type="button"
                  className={`gpi-mode-tab ${prViewTab === 'pr' ? 'active' : ''}`}
                  onClick={() => setPrViewTab('pr')}
                >
                  {prResolution.type === 'pr' ? <GitPullRequest size={12} /> : <GitCommit size={12} />}
                  <span>{prResolution.title || (prResolution.type === 'pr' ? 'PR' : 'Commit')} ({prResolution.files.length})</span>
                </button>
                <button
                  type="button"
                  className={`gpi-mode-tab ${prViewTab === 'tree' ? 'active' : ''}`}
                  onClick={() => setPrViewTab('tree')}
                >
                  <Folder size={12} />
                  <span>{t('dock_pr_repo_tab', activeLocale)}</span>
                </button>
              </div>
            )}

            {/* Search */}
            {(isAnalyzed || Object.keys(treeRoot).length > 0 || (prResolution && prResolution.files.length > 0)) && (
              <div className="gpi-search-container">
                <Search size={12} className="gpi-search-icon" />
                <input
                  type="text"
                  className="gpi-search-input"
                  placeholder={t('dock_search_placeholder', activeLocale)}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {/* Body Content */}
            <div className="gpi-tree-body">
              {prResolution && prResolution.files.length > 0 && prViewTab === 'pr' ? (
                (() => {
                  const query = searchQuery.toLowerCase().trim()
                  const filtered = prResolution.files.filter((f) =>
                    query ? f.filename.toLowerCase().includes(query) : true
                  )
                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--gpi-text-muted)', fontSize: 12 }}>
                        {t('dock_pr_no_files', activeLocale)}
                      </div>
                    )
                  }
                  return filtered.map((file) => {
                    const fileUrl = `#${file.diffAnchor}`
                    const isActivePrFile = activePath === file.filename
                    return (
                      <div
                        key={file.filename}
                        className={`gpi-tree-row ${isActivePrFile ? 'is-active-item' : ''}`}
                        style={{ paddingLeft: 14, paddingRight: 8 }}
                        title={file.filename}
                      >
                        <a
                          href={fileUrl}
                          className="gpi-tree-left"
                          style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
                          onClick={(e) => {
                            e.preventDefault()
                            setActivePath(file.filename)
                            const targetEl =
                              document.getElementById(file.diffAnchor) ||
                              document.querySelector(`[data-tagsearch-path="${file.filename}"]`) ||
                              document.querySelector(`[data-path="${file.filename}"]`)
                            if (targetEl) {
                              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              try {
                                window.history.replaceState(null, '', `#${file.diffAnchor}`)
                              } catch {}
                            } else {
                              const target = parsePrOrCommitUrl(window.location.href)
                              if (target.type === 'pr' && target.pullNumber) {
                                window.location.href = `https://github.com/${owner}/${repo}/pull/${target.pullNumber}/files#${file.diffAnchor}`
                              }
                            }
                          }}
                        >
                          {getFileIcon(file.filename, codeTreePreferences?.iconTheme || 'vscode')}
                          <span className="gpi-tree-label" style={{ fontSize: 12 }}>
                            {file.filename}
                          </span>
                          <span className="gpi-diff-stats">
                            {file.additions > 0 && <span className="gpi-diff-add">+{file.additions}</span>}
                            {file.deletions > 0 && <span className="gpi-diff-del">-{file.deletions}</span>}
                            <span className={`gpi-diff-status gpi-status-${file.status}`}>
                              {file.status[0].toUpperCase()}
                            </span>
                          </span>
                        </a>
                      </div>
                    )
                  })
                })()
              ) : Object.keys(treeRoot).length > 0 ? (
                <>
                  {!isAnalyzed && onTriggerAnalysis && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--gpi-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(234, 179, 8, 0.08)' }}>
                      <span style={{ fontSize: 11, color: 'var(--gpi-text-muted)' }}>{t('dock_live_tree_badge', activeLocale)}</span>
                      <button
                        type="button"
                        onClick={onTriggerAnalysis}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#eab308',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title={t('dock_analyze_title', activeLocale)}
                      >
                        <Zap size={11} />
                        {t('dock_analyze_btn', activeLocale)}
                      </button>
                    </div>
                  )}
                  {renderNodes(treeRoot)}
                </>
              ) : isLoadingTree ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--gpi-text-muted)', fontSize: 12 }}>
                  <div className="gpi-tab-pulse-dot" style={{ margin: '0 auto 8px auto', background: 'var(--gpi-accent)' }} />
                  {t('dock_loading_tree', activeLocale)}
                </div>
              ) : !isAnalyzed ? (
                <div className="gpi-cta-box">
                  <Zap size={24} style={{ color: '#eab308', margin: '0 auto 8px auto', display: 'block' }} />
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    {t('dock_unverified_repo_title', activeLocale)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gpi-text-muted)', lineHeight: 1.4 }}>
                    {t('dock_unverified_repo_desc', activeLocale)}
                  </div>
                  <button
                    type="button"
                    className="gpi-cta-btn"
                    onClick={() => {
                      if (onTriggerAnalysis) {
                        onTriggerAnalysis()
                      } else if (onOpenSidepanel) {
                        onOpenSidepanel()
                      }
                    }}
                  >
                    <Zap size={13} />
                    <span>{t('dock_analyze_repo_cta', activeLocale)}</span>
                  </button>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--gpi-text-muted)', fontSize: 12 }}>
                  {searchQuery ? t('dock_no_files_found', activeLocale) : t('dock_no_files_available', activeLocale)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* AI Explanation Popover - Fixed position outside scroll body */}
      {explainingFile && isOpen && (
        <div
          style={{
            position: 'fixed',
            left: isRight ? 'auto' : `${width + 10}px`,
            right: isRight ? `${width + 10}px` : 'auto',
            top: `${Math.min(typeof window !== 'undefined' ? window.innerHeight - 340 : 200, Math.max(80, popoverTop))}px`,
            zIndex: 2147483647,
            pointerEvents: 'auto',
          }}
        >
          <FileAiExplainerPopover
            filePath={explainingFile}
            owner={owner}
            repo={repo}
            ref={ref}
            isPro={isPro}
            locale={activeLocale}
            onClose={() => setExplainingFile(null)}
            onUpgradeToPro={onOpenSidepanel}
          />
        </div>
      )}
    </div>
  )
}
