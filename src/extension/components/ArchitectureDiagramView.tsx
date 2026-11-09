import { useState } from 'react'
import {
  Layers,
  Copy,
  Check,
  Code2,
  Sparkles,
} from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import type { ActiveLocale } from '../i18n'

type ArchitectureDiagramViewProps = {
  report: RepositoryReport
  locale?: ActiveLocale
}

// Generate valid Mermaid flowchart syntax for GitHub / Notion exports
export function generateMermaidArchitecture(report: RepositoryReport, locale: ActiveLocale = 'es'): string {
  const isEs = locale === 'es'
  const repoName = report.repository?.name || 'App'
  const files = (report.importantFiles || [])
    .filter(Boolean)
    .map((f) => (f?.path || '').toLowerCase())
    .filter(Boolean)
  const topDeps = (report.dependencies || [])
    .filter(Boolean)
    .slice(0, 5)
    .map((d) => d?.name || '')
    .filter(Boolean)
  const primaryLang = report.languages?.[0]?.name || 'TypeScript'

  // Categorize detected architecture layers
  const uiFolders: string[] = []
  const coreFolders: string[] = []
  const apiFolders: string[] = []

  files.forEach((f) => {
    if (f.includes('component') || f.includes('page') || f.includes('view') || f.includes('ui/') || f.includes('src/components')) {
      uiFolders.push(f.split('/')[0] || f)
    } else if (f.includes('api') || f.includes('route') || f.includes('server') || f.includes('backend') || f.includes('db')) {
      apiFolders.push(f.split('/')[0] || f)
    } else if (f.includes('src') || f.includes('lib') || f.includes('util') || f.includes('core') || f.includes('feature')) {
      coreFolders.push(f.split('/')[0] || f)
    }
  })

  const uniqueUI = Array.from(new Set(uiFolders)).slice(0, 3)
  const uniqueCore = Array.from(new Set(coreFolders)).slice(0, 3)
  const uniqueAPI = Array.from(new Set(apiFolders)).slice(0, 3)

  let chart = `graph TD\n`
  chart += `  Root["🚀 ${repoName} (${primaryLang})"]:::rootNode\n`

  // Layer 1: Client / UI Layer
  const uiLabel = uniqueUI.length > 0 ? uniqueUI.join(', ') : 'components, views'
  chart += `  UI["🎨 ${isEs ? 'Capa Visual & UI' : 'UI & Presentation Layer'}\\n(${uiLabel})"]:::uiNode\n`
  chart += `  Root --> UI\n`

  // Layer 2: Core Business Logic
  const coreLabel = uniqueCore.length > 0 ? uniqueCore.join(', ') : 'src, lib, hooks'
  chart += `  Core["⚙️ ${isEs ? 'Lógica Core & Features' : 'Core Logic & Features'}\\n(${coreLabel})"]:::coreNode\n`
  chart += `  UI --> Core\n`

  // Layer 3: Services & Data API
  const apiLabel = uniqueAPI.length > 0 ? uniqueAPI.join(', ') : 'api, services, routes'
  chart += `  Services["🌐 ${isEs ? 'Servicios & Red / API' : 'Services & API Routes'}\\n(${apiLabel})"]:::apiNode\n`
  chart += `  Core --> Services\n`

  // Layer 4: Dependencies / External Ecosystem
  if (topDeps.length > 0) {
    const depsLabel = topDeps.join(', ')
    chart += `  Deps["📦 ${isEs ? 'Dependencias Clave' : 'Key Dependencies'}\\n(${depsLabel})"]:::depNode\n`
    chart += `  Core -.-> Deps\n`
  }

  // Styles
  chart += `\n  classDef rootNode fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#ffffff,font-weight:bold;\n`
  chart += `  classDef uiNode fill:#0f2b38,stroke:#38bdf8,stroke-width:1.5px,color:#e0f2fe;\n`
  chart += `  classDef coreNode fill:#1c2d27,stroke:#34d399,stroke-width:1.5px,color:#d1fae5;\n`
  chart += `  classDef apiNode fill:#31203b,stroke:#c084fc,stroke-width:1.5px,color:#fae8ff;\n`
  chart += `  classDef depNode fill:#332219,stroke:#fb923c,stroke-width:1.5px,color:#ffedd5;\n`

  return chart
}

export function ArchitectureDiagramView({ report, locale = 'es' }: ArchitectureDiagramViewProps) {
  const isEs = locale === 'es'
  const [copiedMermaid, setCopiedMermaid] = useState(false)
  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram')

  const mermaidCode = generateMermaidArchitecture(report, locale)

  const repoName = report.repository?.name || 'App'
  const primaryLang = report.languages?.[0]?.name || 'TypeScript'
  const files = (report.importantFiles || [])
    .filter(Boolean)
    .map((f) => (f?.path || '').toLowerCase())

  const uiFolders: string[] = []
  const coreFolders: string[] = []
  const apiFolders: string[] = []

  files.forEach((f) => {
    if (f.includes('component') || f.includes('page') || f.includes('view') || f.includes('ui/') || f.includes('src/components')) {
      uiFolders.push(f.split('/')[0] || f)
    } else if (f.includes('api') || f.includes('route') || f.includes('server') || f.includes('backend') || f.includes('db')) {
      apiFolders.push(f.split('/')[0] || f)
    } else if (f.includes('src') || f.includes('lib') || f.includes('util') || f.includes('core') || f.includes('feature')) {
      coreFolders.push(f.split('/')[0] || f)
    }
  })

  const uiDesc = Array.from(new Set(uiFolders)).slice(0, 3).join(', ') || 'JSX, Tailwind, Vistas & UI'
  const coreDesc = Array.from(new Set(coreFolders)).slice(0, 3).join(', ') || 'Lógica de negocio, Hooks & Estado'
  const apiDesc = Array.from(new Set(apiFolders)).slice(0, 3).join(', ') || 'Endpoints, Rutas & Controladores'
  const topDeps = (report.dependencies || []).slice(0, 4).map((d) => d.name).join(', ')

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode)
      setCopiedMermaid(true)
      setTimeout(() => setCopiedMermaid(false), 2000)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="architecture-diagram-card">
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={15} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEs ? 'Diagrama de Arquitectura' : 'Architecture Diagram'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`btn-secondary ${viewMode === 'diagram' ? 'active' : ''}`}
            onClick={() => setViewMode('diagram')}
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            <Layers size={11} />
            <span>{isEs ? 'Visual' : 'Visual'}</span>
          </button>
          <button
            type="button"
            className={`btn-secondary ${viewMode === 'code' ? 'active' : ''}`}
            onClick={() => setViewMode('code')}
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            <Code2 size={11} />
            <span>Mermaid</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopyCode}
            title={isEs ? 'Copiar código Mermaid' : 'Copy Mermaid code'}
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            {copiedMermaid ? <Check size={11} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={11} />}
            <span>{copiedMermaid ? (isEs ? 'Copiado' : 'Copied') : (isEs ? 'Copiar' : 'Copy')}</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Clean, Native Vector Architecture Flow (Zero runtime dependencies, 100% resilient) */}
      {viewMode === 'diagram' && (
        <div className="diagram-canvas-box">
          <div className="architecture-fallback-flow">
            {/* Layer 1: Root */}
            <div className="arch-layer-box layer-root">
              <span className="arch-layer-badge">Root Entry</span>
              <strong>🚀 {repoName}</strong>
              <span className="arch-layer-sub">{primaryLang} • {report.repository.defaultBranch || 'main'}</span>
            </div>

            <div className="arch-connector-down">↓</div>

            {/* Layer 2: Presentation / UI */}
            <div className="arch-layer-box layer-ui">
              <span className="arch-layer-badge">Presentation</span>
              <strong>🎨 {isEs ? 'Capa Visual & Componentes' : 'UI & Presentation'}</strong>
              <span className="arch-layer-sub">{uiDesc}</span>
            </div>

            <div className="arch-connector-down">↓</div>

            {/* Layer 3: Core Logic */}
            <div className="arch-layer-box layer-core">
              <span className="arch-layer-badge">Core Logic</span>
              <strong>⚙️ {isEs ? 'Lógica de Negocio & Módulos' : 'Core Business Logic'}</strong>
              <span className="arch-layer-sub">{coreDesc}</span>
            </div>

            <div className="arch-connector-down">↓</div>

            {/* Layer 4: Network & API */}
            <div className="arch-layer-box layer-api">
              <span className="arch-layer-badge">API & Services</span>
              <strong>🌐 {isEs ? 'Servicios & Red' : 'Services & Network'}</strong>
              <span className="arch-layer-sub">{apiDesc}</span>
            </div>

            {/* Layer 5: Dependencies if available */}
            {topDeps && (
              <>
                <div className="arch-connector-down" style={{ borderStyle: 'dashed' }}>⇣</div>
                <div className="arch-layer-box" style={{ background: 'rgba(251, 146, 60, 0.12)', borderColor: 'rgba(251, 146, 60, 0.3)', color: '#fed7aa' }}>
                  <span className="arch-layer-badge" style={{ color: '#fb923c' }}>Dependencies</span>
                  <strong style={{ color: '#fed7aa' }}>📦 {isEs ? 'Ecosistema Externo' : 'External Ecosystem'}</strong>
                  <span className="arch-layer-sub" style={{ color: '#fdba74' }}>{topDeps}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Mermaid Raw Source Code for GitHub & Notion */}
      {viewMode === 'code' && (
        <div style={{ position: 'relative' }}>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              background: '#0a0d12',
              color: '#7dd3fc',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              overflowX: 'auto',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {mermaidCode}
          </pre>
        </div>
      )}

      {/* Footer hint */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
        <span>{isEs ? 'Diagrama nativo con exportación Mermaid' : 'Native diagram with Mermaid export'}</span>
        <span>{isEs ? 'Compatible con Notion y GitHub' : 'Compatible with Notion & GitHub'}</span>
      </div>
    </div>
  )
}
