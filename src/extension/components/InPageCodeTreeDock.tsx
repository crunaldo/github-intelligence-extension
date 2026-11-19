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
  SidebarClose,
  SidebarOpen,
} from 'lucide-react'
import type { TreeEntry } from '../../features/repository/types'
import { classifyFile } from '../utils/fileClassifier'
import { FileAiExplainerPopover } from './FileAiExplainerPopover'

export interface InPageCodeTreeDockProps {
  owner: string
  repo: string
  ref?: string
  initialEntries?: TreeEntry[]
  isAnalyzed?: boolean
  defaultOpen?: boolean
  isPro?: boolean
  vulnerableManifests?: string[]
  onOpenSidepanel?: () => void
  onTriggerAnalysis?: () => void
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

function getFileIcon(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return <FileCode size={13} style={{ color: '#38bdf8' }} />
  if (lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.mjs')) return <FileCode size={13} style={{ color: '#60a5fa' }} />
  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml')) return <FileJson size={13} style={{ color: '#fbbf24' }} />
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return <Palette size={13} style={{ color: '#c084fc' }} />
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return <FileText size={13} style={{ color: '#34d399' }} />
  return <FileCode size={13} style={{ color: '#94a3b8' }} />
}

export function InPageCodeTreeDock({
  owner,
  repo,
  ref = 'main',
  initialEntries = [],
  isAnalyzed = false,
  defaultOpen = false,
  isPro = false,
  vulnerableManifests = [],
  onOpenSidepanel,
  onTriggerAnalysis,
}: InPageCodeTreeDockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [searchQuery, setSearchQuery] = useState('')
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    src: true,
    app: true,
    lib: true,
  })
  const [explainingFile, setExplainingFile] = useState<string | null>(null)
  const [popoverTop, setPopoverTop] = useState<number>(100)
  const isResizingRef = useRef(false)

  // Load saved width & open state
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([STORAGE_WIDTH_KEY, STORAGE_OPEN_KEY], (res) => {
        const saved = res?.[STORAGE_WIDTH_KEY]
        if (typeof saved === 'number' && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
          setWidth(saved)
        }
        if (typeof res?.[STORAGE_OPEN_KEY] === 'boolean' && defaultOpen === undefined) {
          setIsOpen(res[STORAGE_OPEN_KEY])
        }
      })
    }
  }, [defaultOpen])

  const toggleDock = (openState?: boolean) => {
    setIsOpen((prev) => {
      const next = typeof openState === 'boolean' ? openState : !prev
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_OPEN_KEY]: next }).catch(() => {})
      }
      return next
    })
  }

  // Keyboard shortcut: Alt+W / Option+W
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        toggleDock()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Mouse drag resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX))
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
  }, [width])

  // Build tree from flat list
  const { treeRoot, totalCount, matchCount } = useMemo(() => {
    const root: Record<string, TreeNode> = {}
    let total = 0
    let matched = 0

    const query = searchQuery.toLowerCase().trim()
    const valid = (initialEntries || []).filter((e) => Boolean(e?.path))
    total = valid.length

    valid.forEach((entry) => {
      const isMatch = !query || entry.path.toLowerCase().includes(query)
      if (isMatch) matched++
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

    return { treeRoot: root, totalCount: total, matchCount: matched }
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
              onClick={() => toggleFolder(node.path)}
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
          >
            {getFileIcon(node.name)}
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
    <div className="gpi-dock-container">
      {/* Pinned Toggle Tab Handle */}
      <div
        className="gpi-toggle-tab"
        onClick={() => toggleDock()}
        title={isOpen ? 'Ocultar árbol de código (Alt+W)' : 'Mostrar árbol de código (Alt+W)'}
      >
        {isOpen ? <SidebarClose size={16} /> : <SidebarOpen size={16} />}
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
              className="gpi-btn-icon"
              onClick={() => toggleAll(!Object.values(openFolders).some(Boolean))}
              title="Expandir/Colapsar todo"
            >
              <ChevronsUpDown size={13} />
            </button>
            <button
              type="button"
              className="gpi-btn-icon"
              onClick={() => toggleDock(false)}
              title="Cerrar (Alt+W)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        {isAnalyzed && (
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
          {!isAnalyzed ? (
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
      </div>

      {/* AI Explanation Popover - Fixed position outside scroll body to prevent clipping */}
      {explainingFile && isOpen && (
        <div
          style={{
            position: 'fixed',
            left: `${width + 10}px`,
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
