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
  GitPullRequest,
  GitCommit,
} from 'lucide-react'
import type { TreeEntry } from '../../features/repository/types'
import { classifyFile, getFileIcon } from '../utils/fileClassifier'
import { FileAiExplainerPopover } from './FileAiExplainerPopover'
import type { CodeTreePreferences } from '../storage'
import { DEFAULT_CODE_TREE_PREFERENCES, saveStoredPreferences, getStoredGitHubToken } from '../storage'
import {
  parsePrOrCommitUrl,
  resolvePrOrCommitFiles,
  type PrFileEntry,
  type PrOrCommitResolution,
} from '../utils/prCommitResolver'

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
  onOpenSidepanel?: () => void
  onOpenSettings?: () => void
  onTriggerAnalysis?: () => void
  prOrCommitResolution?: PrOrCommitResolution | null
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
  onOpenSidepanel,
  onOpenSettings,
  onTriggerAnalysis,
  prOrCommitResolution,
}: InPageCodeTreeDockProps) {
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
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    src: true,
    app: true,
    lib: true,
  })
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

    if (typeof window === 'undefined') return
    const target = parsePrOrCommitUrl(window.location.href)
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
  }, [owner, repo, prOrCommitResolution])

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
    const valid = (initialEntries || []).filter((e) => Boolean(e?.path))

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
  }, [initialEntries, searchQuery])

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const toggleAll = (expand: boolean) => {
    if (!expand) {
      setOpenFolders({})
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
  }

  // Handle SPA navigation without closing or reloading dock
  const handleFileClick = (e: React.MouseEvent<HTMLAnchorElement>, fileUrl: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Always keep dock open across file navigation
    updateIsOpen(true)

    // Trigger synthetic link click on document.body so GitHub Turbo intercepts it cleanly
    if (typeof document !== 'undefined') {
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

  if (isHiddenByUrl) {
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
        return (
          <div key={node.path}>
            <div
              className="gpi-tree-row"
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

      return (
        <div
          key={node.path}
          className="gpi-tree-row"
          style={{ paddingLeft: depth * 14 + 24 }}
          title={node.path}
        >
          <a
            href={fileUrl}
            className="gpi-tree-left"
            style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
            onClick={(e) => handleFileClick(e, fileUrl)}
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
            title="Explicar archivo con IA"
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
            ? `Ocultar árbol de código (${codeTreePreferences?.shortcut || 'Alt+W'})`
            : `Mostrar árbol de código (${codeTreePreferences?.shortcut || 'Alt+W'})`
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
          title="Arrastrar para redimensionar"
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
                title="Abrir en Panel Lateral (Sidepanel)"
              >
                <ExternalLink size={13} />
              </button>
            )}
            <button
              type="button"
              className={`gpi-btn-icon ${isPinned ? 'is-active' : ''}`}
              style={{
                color: isPinned ? 'var(--gpi-accent)' : undefined,
                background: isPinned ? 'rgba(56, 189, 248, 0.15)' : undefined,
              }}
              onClick={() => updateIsPinned(!isPinned)}
              title={isPinned ? 'Despinear panel del explorador (Unpin)' : 'Pinear panel al navegador (Pin)'}
            >
              {isPinned ? <Pin size={13} style={{ fill: 'currentColor' }} /> : <PinOff size={13} />}
            </button>
            <button
              type="button"
              className={`gpi-btn-icon ${activeView === 'settings' ? 'is-active' : ''}`}
              style={{
                color: activeView === 'settings' ? 'var(--gpi-accent)' : undefined,
                background: activeView === 'settings' ? 'rgba(56, 189, 248, 0.15)' : undefined,
              }}
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings()
                } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                  chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_SETTINGS', target: 'codeTree' }).catch(() => {})
                }
                setActiveView((prev) => (prev === 'settings' ? 'tree' : 'settings'))
              }}
              title="Ajustes del Árbol de Código"
            >
              <Settings size={13} />
            </button>
            {activeView === 'tree' && (
              <button
                type="button"
                className="gpi-btn-icon"
                onClick={() => toggleAll(!Object.values(openFolders).some(Boolean))}
                title="Expandir/Colapsar todo"
              >
                <ChevronsUpDown size={13} />
              </button>
            )}
            <button
              type="button"
              className="gpi-btn-icon"
              onClick={() => toggleDock(false)}
              title={`Cerrar (${codeTreePreferences?.shortcut || 'Alt+W'})`}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* View Switching: In-Dock Settings vs Tree Content */}
        {activeView === 'settings' ? (
          <div className="gpi-dock-settings-view">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gpi-text)' }}>
                Ajustes del Explorador
              </div>
              <button
                type="button"
                className="gpi-btn-icon"
                onClick={() => setActiveView('tree')}
                title="Volver al árbol de archivos"
              >
                <ArrowLeft size={14} />
              </button>
            </div>

            {/* Pin per window */}
            <div className="gpi-dock-settings-row">
              <div>
                <div className="gpi-dock-settings-title">Pinear al navegador (Pin)</div>
                <div className="gpi-dock-settings-desc">Fija el explorador a la pantalla y desplaza el contenido de GitHub.</div>
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
                <div className="gpi-dock-settings-title">Abrir carpetas con 1 clic</div>
                <div className="gpi-dock-settings-desc">Alterna carpetas al hacer clic en cualquier parte de su fila.</div>
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
                <div className="gpi-dock-settings-title">Hover to open</div>
                <div className="gpi-dock-settings-desc">Despliega el explorador al pasar el puntero sobre la pestaña.</div>
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
              <div className="gpi-dock-settings-title" style={{ marginBottom: 6 }}>Lado de la pantalla</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {(['left', 'right'] as const).map((pos) => {
                  const isSelected = (codeTreePreferences?.tabPosition || 'left') === pos
                  return (
                    <button
                      key={pos}
                      type="button"
                      className={`gpi-dock-settings-btn ${isSelected ? 'primary' : ''}`}
                      onClick={() => {
                        void saveStoredPreferences({
                          codeTree: { ...codeTreePreferences, tabPosition: pos },
                        })
                      }}
                    >
                      {pos === 'left' ? 'Izquierda' : 'Derecha'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Shortcut Info */}
            <div style={{ marginTop: 4 }}>
              <div className="gpi-dock-settings-title">Atajo de teclado</div>
              <div className="gpi-dock-settings-desc">
                Presiona <kbd style={{ background: 'var(--gpi-bg)', padding: '2px 5px', borderRadius: 4, border: '1px solid var(--gpi-border)' }}>{codeTreePreferences?.shortcut || 'Alt+W'}</kbd> para alternar el explorador.
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
                <span>Abrir ajustes en Panel Lateral</span>
              </button>
              <button
                type="button"
                className="gpi-dock-settings-btn"
                onClick={() => setActiveView('tree')}
              >
                <span>Volver al árbol de archivos</span>
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
                  <span>Repositorio</span>
                </button>
              </div>
            )}

            {/* Search */}
            {(isAnalyzed || (prResolution && prResolution.files.length > 0)) && (
              <div className="gpi-search-container">
                <Search size={12} className="gpi-search-icon" />
                <input
                  type="text"
                  className="gpi-search-input"
                  placeholder="Filtrar archivos..."
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
                        No se encontraron archivos en este cambio
                      </div>
                    )
                  }
                  return filtered.map((file) => {
                    const fileUrl = `#${file.diffAnchor}`
                    return (
                      <div
                        key={file.filename}
                        className="gpi-tree-row"
                        style={{ paddingLeft: 14, paddingRight: 8 }}
                        title={file.filename}
                      >
                        <a
                          href={fileUrl}
                          className="gpi-tree-left"
                          style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
                          onClick={(e) => {
                            e.preventDefault()
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
              ) : !isAnalyzed ? (
                <div className="gpi-cta-box">
                  <Zap size={24} style={{ color: '#eab308', margin: '0 auto 8px auto', display: 'block' }} />
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    Repositorio no analizado
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gpi-text-muted)', lineHeight: 1.4 }}>
                    Analiza el repositorio para explorar árbol de código, dependencias y explicaciones de IA.
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
                    <span>Analizar repositorio (1 clic)</span>
                  </button>
                </div>
              ) : Object.keys(treeRoot).length > 0 ? (
                renderNodes(treeRoot)
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--gpi-text-muted)', fontSize: 12 }}>
                  {searchQuery ? 'No se encontraron archivos' : 'Sin archivos disponibles'}
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
            onClose={() => setExplainingFile(null)}
            onUpgradeToPro={onOpenSidepanel}
          />
        </div>
      )}
    </div>
  )
}
