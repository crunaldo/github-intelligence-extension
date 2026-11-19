import type { RepositoryReport } from '../../features/repository/types'
import type { ActiveLocale } from '../i18n'
import { sanitizeMermaidDiagram } from './mermaidSanitizer'

/**
 * Generates a structured, deterministic Mermaid flowchart diagram directly from
 * repository signals (files, directory tree, manifest dependencies, and languages).
 *
 * Runs 100% locally on the client without network calls, API quotas, or external AI models.
 */
export function generateNativeArchitectureDiagram(
  report: RepositoryReport,
  locale: ActiveLocale = 'es'
): string {
  const isEs = locale === 'es'
  const repoName = report.repository?.name || report.target?.repository || 'Repository'
  const primaryLang =
    report.languages?.[0]?.name ||
    (report.manifests?.[0]?.ecosystem === 'npm' ? 'TypeScript/JavaScript' : 'Software')

  // Collect candidate file paths from tree and importantFiles
  const allFiles: string[] = []
  if (Array.isArray(report.tree)) {
    report.tree.forEach((t) => {
      if (t?.path) allFiles.push(t.path.toLowerCase())
    })
  }
  if (Array.isArray(report.importantFiles)) {
    report.importantFiles.forEach((f) => {
      if (f?.path) allFiles.push(f.path.toLowerCase())
    })
  }

  // Collect dependencies
  const depNames = (report.dependencies || [])
    .filter(Boolean)
    .map((d) => (d?.name || '').toLowerCase())
    .filter(Boolean)

  // Categorize detected architecture layers
  const uiSignals: string[] = []
  const coreSignals: string[] = []
  const apiSignals: string[] = []
  const dataSignals: string[] = []
  const cliSignals: string[] = []

  // Check frameworks and tooling in dependencies
  const detectedFrameworks: string[] = []
  if (depNames.some((d) => d.includes('react') || d.includes('next') || d.includes('remix'))) {
    detectedFrameworks.push('React/Next.js')
  } else if (depNames.some((d) => d.includes('vue') || d.includes('nuxt'))) {
    detectedFrameworks.push('Vue/Nuxt')
  } else if (depNames.some((d) => d.includes('svelte'))) {
    detectedFrameworks.push('Svelte')
  } else if (depNames.some((d) => d.includes('angular'))) {
    detectedFrameworks.push('Angular')
  }

  if (depNames.some((d) => d.includes('tailwind'))) detectedFrameworks.push('TailwindCSS')
  if (depNames.some((d) => d.includes('vite') || d.includes('webpack') || d.includes('wxt'))) {
    detectedFrameworks.push('Bundler/Vite')
  }

  // Backend / Server frameworks
  const detectedServers: string[] = []
  if (depNames.some((d) => d === 'express' || d.includes('fastify') || d.includes('koa'))) {
    detectedServers.push('Express/Fastify')
  } else if (depNames.some((d) => d.includes('@nestjs') || d.includes('nest'))) {
    detectedServers.push('NestJS')
  } else if (depNames.some((d) => d.includes('hono'))) {
    detectedServers.push('Hono')
  }

  // Databases & ORMs
  const detectedDatabases: string[] = []
  if (depNames.some((d) => d.includes('prisma'))) detectedDatabases.push('Prisma ORM')
  if (depNames.some((d) => d.includes('drizzle'))) detectedDatabases.push('Drizzle ORM')
  if (depNames.some((d) => d.includes('typeorm') || d.includes('mongoose'))) detectedDatabases.push('TypeORM/Mongoose')
  if (depNames.some((d) => d.includes('supabase'))) detectedDatabases.push('Supabase')
  if (depNames.some((d) => d.includes('redis') || d.includes('ioredis'))) detectedDatabases.push('Redis')
  if (depNames.some((d) => d === 'pg' || d.includes('postgres'))) detectedDatabases.push('PostgreSQL')
  if (depNames.some((d) => d.includes('sqlite'))) detectedDatabases.push('SQLite')

  // Scan file paths for architecture patterns
  allFiles.forEach((file) => {
    if (
      file.includes('component') ||
      file.includes('page') ||
      file.includes('view') ||
      file.startsWith('ui/') ||
      file.includes('/ui/') ||
      file.includes('styles') ||
      file.includes('template')
    ) {
      uiSignals.push(file.split('/')[0] || file)
    } else if (
      file.includes('bin/') ||
      file.includes('cli.') ||
      file.includes('cmd/') ||
      file.startsWith('bin') ||
      file.startsWith('cli')
    ) {
      cliSignals.push(file.split('/')[0] || file)
    } else if (
      file.includes('api') ||
      file.includes('route') ||
      file.includes('server') ||
      file.includes('controller') ||
      file.includes('handler') ||
      file.includes('endpoint')
    ) {
      apiSignals.push(file.split('/')[0] || file)
    } else if (
      file.includes('model') ||
      file.includes('entity') ||
      file.includes('db/') ||
      file.includes('database') ||
      file.includes('prisma') ||
      file.includes('schema') ||
      file.includes('migration')
    ) {
      dataSignals.push(file.split('/')[0] || file)
    } else if (
      file.includes('src') ||
      file.includes('lib') ||
      file.includes('util') ||
      file.includes('core') ||
      file.includes('service') ||
      file.includes('hook') ||
      file.includes('store') ||
      file.includes('feature')
    ) {
      coreSignals.push(file.split('/')[0] || file)
    }
  })

  const hasUI = uiSignals.length > 0 || detectedFrameworks.length > 0
  const hasCLI = cliSignals.length > 0 && !hasUI
  const hasAPI = apiSignals.length > 0 || detectedServers.length > 0
  const hasData = dataSignals.length > 0 || detectedDatabases.length > 0
  const hasCore = coreSignals.length > 0 || (!hasUI && !hasAPI && !hasData)

  // Top dependencies summary (up to 5 clean names)
  const topDeps = (report.dependencies || [])
    .filter(Boolean)
    .slice(0, 5)
    .map((d) => d?.name || '')
    .filter(Boolean)

  let chart = `graph TD\n`
  chart += `  Root["🚀 ${cleanLabel(repoName)} (${cleanLabel(primaryLang)})"]:::rootNode\n`

  let previousNodeId = 'Root'

  // 1. Presentation / UI Layer or CLI Entrypoint
  if (hasUI) {
    const uiDetails = Array.from(new Set([...detectedFrameworks, ...uiSignals.slice(0, 3)])).join(', ')
    const label = uiDetails ? `\\n(${cleanLabel(uiDetails)})` : ''
    chart += `  UI["🎨 ${isEs ? 'Capa Visual & UI' : 'UI & Presentation Layer'}${label}"]:::uiNode\n`
    chart += `  ${previousNodeId} --> UI\n`
    previousNodeId = 'UI'
  } else if (hasCLI) {
    const label = isEs ? 'Línea de Comandos (CLI)' : 'Command Line Interface (CLI)'
    chart += `  CLI["⚡ ${label}\\n(bin, cmd, entrypoint)"]:::uiNode\n`
    chart += `  ${previousNodeId} --> CLI\n`
    previousNodeId = 'CLI'
  }

  // 2. Core Business Logic & State Layer
  if (hasCore) {
    const coreDetails = Array.from(new Set(coreSignals.slice(0, 3))).join(', ') || 'src, lib, services'
    chart += `  Core["⚙️ ${isEs ? 'Lógica Core & Estado' : 'Core Logic & State'}\\n(${cleanLabel(coreDetails)})"]:::coreNode\n`
    chart += `  ${previousNodeId} --> Core\n`
    previousNodeId = 'Core'
  }

  // 3. API & Server Routes Layer
  if (hasAPI) {
    const apiDetails = Array.from(new Set([...detectedServers, ...apiSignals.slice(0, 3)])).join(', ') || 'api, routes'
    chart += `  API["🌐 ${isEs ? 'Servicios & Rutas API' : 'API Routes & Network'}\\n(${cleanLabel(apiDetails)})"]:::apiNode\n`
    chart += `  ${previousNodeId} --> API\n`
    previousNodeId = 'API'
  }

  // 4. Data & Persistence Layer
  if (hasData) {
    const dataDetails = Array.from(new Set([...detectedDatabases, ...dataSignals.slice(0, 3)])).join(', ') || 'db, schema, models'
    chart += `  Data["💾 ${isEs ? 'Datos & Persistencia' : 'Data & Storage'}\\n(${cleanLabel(dataDetails)})"]:::dataNode\n`
    chart += `  ${previousNodeId} --> Data\n`
  }

  // 5. External Ecosystem / Dependencies Layer
  if (topDeps.length > 0) {
    const depsLabel = cleanLabel(topDeps.join(', '))
    chart += `  Deps["📦 ${isEs ? 'Dependencias Clave' : 'Key Dependencies'}\\n(${depsLabel})"]:::depNode\n`
    if (hasCore) {
      chart += `  Core -.-> Deps\n`
    } else {
      chart += `  ${previousNodeId} -.-> Deps\n`
    }
  }

  // Styling classes matching the extension's palette
  chart += `\n  classDef rootNode fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#ffffff,font-weight:bold;\n`
  chart += `  classDef uiNode fill:#0f2b38,stroke:#38bdf8,stroke-width:1.5px,color:#e0f2fe;\n`
  chart += `  classDef coreNode fill:#1c2d27,stroke:#34d399,stroke-width:1.5px,color:#d1fae5;\n`
  chart += `  classDef apiNode fill:#31203b,stroke:#c084fc,stroke-width:1.5px,color:#fae8ff;\n`
  chart += `  classDef dataNode fill:#2d1a3b,stroke:#e879f9,stroke-width:1.5px,color:#fdf4ff;\n`
  chart += `  classDef depNode fill:#332219,stroke:#fb923c,stroke-width:1.5px,color:#ffedd5;\n`

  return sanitizeMermaidDiagram(chart)
}

function cleanLabel(str: string): string {
  return str
    .replace(/["\\]/g, '')
    .replace(/[<>]/g, '')
    .trim()
}
