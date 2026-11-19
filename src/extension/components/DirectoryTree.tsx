import React, { useState, useMemo } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  Palette,
  ExternalLink,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react'
import type { TreeEntry } from '../../features/repository/types'
import type { ActiveLocale } from '../i18n'

type DirectoryTreeProps = {
  entries: TreeEntry[]
  repoHtmlUrl: string
  defaultBranch?: string
  locale?: ActiveLocale
}

type TreeNode = {
  name: string
  path: string
  type: 'tree' | 'blob'
  size?: number | null
  children: Record<string, TreeNode>
}

function getFileIcon(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
    return <FileCode size={13} style={{ color: '#38bdf8' }} />
  }
  if (lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.mjs')) {
    return <FileCode size={13} style={{ color: '#60a5fa' }} />
  }
  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml')) {
    return <FileJson size={13} style={{ color: '#fbbf24' }} />
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) {
    return <Palette size={13} style={{ color: '#c084fc' }} />
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.markdown')) {
    return <FileText size={13} style={{ color: '#34d399' }} />
  }
  if (lower.endsWith('.py')) {
    return <FileCode size={13} style={{ color: '#38bdf8' }} />
  }
  if (lower.endsWith('.rs')) {
    return <FileCode size={13} style={{ color: '#fb923c' }} />
  }
  if (lower.endsWith('.go')) {
    return <FileCode size={13} style={{ color: '#22d3ee' }} />
  }
  return <FileCode size={13} style={{ color: '#94a3b8' }} />
}

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DirectoryTree({
  entries = [],
  repoHtmlUrl,
  defaultBranch = 'main',
  locale = 'es',
}: DirectoryTreeProps) {
  const isEs = locale === 'es'
  const [filterQuery, setFilterQuery] = useState('')
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    'src': true,
    'app': true,
    'lib': true,
    'components': true,
  })

  // Build tree from flat TreeEntry list
  const { treeRoot, totalFilesCount, matchedCount } = useMemo(() => {
    const root: Record<string, TreeNode> = {}
    let totalCount = 0
    let matchCount = 0

    const query = filterQuery.toLowerCase().trim()

    // Filter list if query is present
    const validEntries = (entries || []).filter((e) => Boolean(e?.path))
    totalCount = validEntries.length

    validEntries.forEach((entry) => {
      const isMatch = !query || entry.path.toLowerCase().includes(query)
      if (isMatch) matchCount++
      if (query && !isMatch) return

      const parts = entry.path.split('/')
      let currentLevel = root

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1
        const fullPath = parts.slice(0, index + 1).join('/')

        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: fullPath,
            type: isLast ? entry.type : 'tree',
            size: isLast ? entry.size : null,
            children: {},
          }
        }
        currentLevel = currentLevel[part]!.children
      })
    })

    return { treeRoot: root, totalFilesCount: totalCount, matchedCount: matchCount }
  }, [entries, filterQuery])

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  const toggleAll = (expand: boolean) => {
    if (!expand) {
      setOpenFolders({})
      return
    }
    const allDirs: Record<string, boolean> = {}
    const collectDirs = (nodes: Record<string, TreeNode>) => {
      Object.values(nodes).forEach((n) => {
        if (n.type === 'tree' || Object.keys(n.children).length > 0) {
          allDirs[n.path] = true
          collectDirs(n.children)
        }
      })
    }
    collectDirs(treeRoot)
    setOpenFolders(allDirs)
  }

  // Recursive Tree Node Renderer
  const renderNodes = (nodes: Record<string, TreeNode>, depth = 0) => {
    // Sort: directories first, then alphabetical
    const sorted = Object.values(nodes).sort((a, b) => {
      const aIsDir = a.type === 'tree' || Object.keys(a.children).length > 0
      const bIsDir = b.type === 'tree' || Object.keys(b.children).length > 0
      if (aIsDir && !bIsDir) return -1
      if (!aIsDir && bIsDir) return 1
      return a.name.localeCompare(b.name)
    })

    return sorted.map((node) => {
      const isDir = node.type === 'tree' || Object.keys(node.children).length > 0
      // If there's an active search filter, expand matching parent directories automatically
      const isOpen = Boolean(filterQuery) || openFolders[node.path]
      const fileUrl = `${repoHtmlUrl}/blob/${defaultBranch}/${node.path}`

      if (isDir) {
        const childCount = Object.keys(node.children).length
        return (
          <div key={node.path} className="tree-dir-block">
            <div
              className="tree-node-row tree-node-dir"
              style={{ paddingLeft: depth * 14 + 6 }}
              onClick={() => toggleFolder(node.path)}
              title={node.path}
            >
              <div className="tree-node-left">
                <span className="tree-arrow">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="tree-folder-icon">
                  {isOpen ? (
                    <FolderOpen size={13} style={{ color: 'var(--accent-amber, #f59e0b)' }} />
                  ) : (
                    <Folder size={13} style={{ color: 'var(--accent-amber, #f59e0b)' }} />
                  )}
                </span>
                <span className="tree-dir-name">{node.name}</span>
              </div>
              <span className="tree-node-badge">{childCount}</span>
            </div>

            {isOpen && (
              <div className="tree-children-container" style={{ marginLeft: depth * 14 + 12 }}>
                {renderNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        )
      }

      // File item
      return (
        <div
          key={node.path}
          className="tree-node-row tree-node-file group"
          style={{ paddingLeft: depth * 14 + 20 }}
          title={node.path}
        >
          <div className="tree-node-left">
            <span className="tree-file-icon">{getFileIcon(node.name)}</span>
            <span className="tree-file-name">{node.name}</span>
          </div>

          <div className="tree-node-right">
            {node.size ? <span className="tree-file-size">{formatSize(node.size)}</span> : null}
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="tree-github-link"
              title={isEs ? 'Ver archivo en GitHub' : 'View file on GitHub'}
              onClick={(e) => e.stopPropagation()}
            >
              <span>GitHub</span>
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="directory-tree-card">
      {/* Top Search & Filter Bar */}
      <div className="directory-tree-header">
        <div className="directory-tree-search-box">
          <Search size={13} className="directory-tree-search-icon" />
          <input
            type="text"
            className="directory-tree-input"
            placeholder={isEs ? 'Filtrar archivos (ej. index, package, modal)...' : 'Filter files (e.g. index, package, modal)...'}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button
              type="button"
              className="directory-tree-clear-btn"
              onClick={() => setFilterQuery('')}
              title={isEs ? 'Limpiar filtro' : 'Clear filter'}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="directory-tree-actions">
          <span className="directory-tree-counter">
            {filterQuery
              ? (isEs ? `${matchedCount} de ${totalFilesCount} archivos` : `${matchedCount} of ${totalFilesCount} files`)
              : (isEs ? `${totalFilesCount} archivos` : `${totalFilesCount} files`)}
          </span>
          <button
            type="button"
            className="directory-tree-toggle-btn"
            onClick={() => toggleAll(!Object.values(openFolders).some(Boolean))}
            title={isEs ? 'Expandir/Colapsar carpetas' : 'Expand/Collapse folders'}
          >
            <ChevronsUpDown size={12} />
          </button>
        </div>
      </div>

      {/* Tree Content Container */}
      <div className="directory-tree-body">
        {Object.keys(treeRoot).length > 0 ? (
          renderNodes(treeRoot)
        ) : (
          <div className="directory-tree-empty">
            <span>{isEs ? 'No se encontraron archivos que coincidan' : 'No matching files found'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
