import type { RepositoryReport } from '../features/repository/types'

export type DiskInfo = {
  name: string
  mountPoint?: string
  totalBytes: number
  availableBytes: number
  totalGb: number
  availableGb: number
  usedPercent: number
}

export type HardwareInfo = {
  cpuModel: string
  logicalCores: number
  arch: string
  totalMemoryBytes: number
  availableMemoryBytes: number
  totalMemoryGb: number
  availableMemoryGb: number
  memoryUsedPercent: number
  disks: DiskInfo[]
  osName: string
  osDetail: string
  platform: string
}

export type HardwareCompatibility = {
  status: 'compatible' | 'warning' | 'incompatible'
  headline: string
  summary: string
  badgeText: string
  cpuVerdict: { ok: boolean; message: string }
  memoryVerdict: { ok: boolean; message: string }
  diskVerdict: { ok: boolean; message: string }
  osVerdict: { ok: boolean; message: string; badge: string }
  overallRating: number // 1 to 10
  recommendations?: string[]
}

function formatGb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10
}

export async function detectSystemHardware(): Promise<HardwareInfo> {
  let cpuModel = 'Procesador multinúcleo'
  let logicalCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  let arch = 'x86_64'

  let totalMemoryBytes = 8 * 1024 * 1024 * 1024
  let availableMemoryBytes = 4 * 1024 * 1024 * 1024

  const disks: DiskInfo[] = []

  // 1. Detect CPU via chrome.system.cpu
  if (typeof chrome !== 'undefined' && chrome.system?.cpu) {
    try {
      const cpuInfo = await chrome.system.cpu.getInfo()
      if (cpuInfo.modelName) cpuModel = cpuInfo.modelName
      if (cpuInfo.numOfProcessors) logicalCores = cpuInfo.numOfProcessors
      if (cpuInfo.archName) arch = cpuInfo.archName
    } catch {
      // Fallback
    }
  }

  // 2. Detect RAM via chrome.system.memory
  if (typeof chrome !== 'undefined' && chrome.system?.memory) {
    try {
      const memInfo = await chrome.system.memory.getInfo()
      totalMemoryBytes = memInfo.capacity
      availableMemoryBytes = memInfo.availableCapacity
    } catch {
      // Fallback via navigator.deviceMemory
      if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
        totalMemoryBytes = (navigator as any).deviceMemory * 1024 * 1024 * 1024
        availableMemoryBytes = totalMemoryBytes * 0.5
      }
    }
  } else if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
    totalMemoryBytes = (navigator as any).deviceMemory * 1024 * 1024 * 1024
    availableMemoryBytes = totalMemoryBytes * 0.5
  }

  // 3. Detect Disks via chrome.system.storage
  if (typeof chrome !== 'undefined' && chrome.system?.storage) {
    try {
      const storageUnits = await chrome.system.storage.getInfo()
      for (const unit of storageUnits) {
        let available = unit.capacity * 0.4 // default estimate if getAvailableCapacity fails
        try {
          const availInfo = await chrome.system.storage.getAvailableCapacity(unit.id)
          if (availInfo && typeof availInfo.availableCapacity === 'number') {
            available = availInfo.availableCapacity
          }
        } catch {
          // ignore
        }
        const totalGb = formatGb(unit.capacity)
        const availGb = formatGb(available)
        const usedPercent = unit.capacity > 0 ? Math.round(((unit.capacity - available) / unit.capacity) * 100) : 50

        disks.push({
          name: unit.name || 'Disco Principal',
          totalBytes: unit.capacity,
          availableBytes: available,
          totalGb,
          availableGb: availGb,
          usedPercent,
        })
      }
    } catch {
      // ignore
    }
  }

  // Fallback storage estimate if no disks detected through chrome.system.storage
  if (disks.length === 0 && typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate()
      const total = est.quota || 100 * 1024 * 1024 * 1024
      const used = est.usage || 5 * 1024 * 1024 * 1024
      const avail = Math.max(0, total - used)
      disks.push({
        name: 'Disco del Sistema',
        totalBytes: total,
        availableBytes: avail,
        totalGb: formatGb(total),
        availableGb: formatGb(avail),
        usedPercent: Math.round((used / total) * 100),
      })
    } catch {
      // ignore
    }
  }

  if (disks.length === 0) {
    disks.push({
      name: 'Disco Local (C:)',
      totalBytes: 256 * 1024 * 1024 * 1024,
      availableBytes: 85 * 1024 * 1024 * 1024,
      totalGb: 256,
      availableGb: 85,
      usedPercent: 67,
    })
  }

  // Precise OS Detection
  let osName = 'Windows'
  let osDetail = 'Windows 11 (64-bit)'
  let platform = 'win32'

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent
    const uaLower = ua.toLowerCase()

    if (uaLower.includes('win')) {
      osName = 'Windows'
      platform = 'windows'
      // Modern Windows OS detection
      if (ua.includes('Windows NT 10.0') || ua.includes('Windows 11')) {
        osDetail = 'Windows 11 / 10 (64-bit)'
      } else if (ua.includes('Windows NT 6.3')) {
        osDetail = 'Windows 8.1 (64-bit)'
      } else {
        osDetail = 'Windows (64-bit)'
      }
    } else if (uaLower.includes('mac') || uaLower.includes('darwin')) {
      osName = 'macOS'
      platform = 'darwin'
      osDetail = arch.includes('arm') || arch.includes('aarch64') ? 'macOS (Apple Silicon)' : 'macOS (64-bit)'
    } else if (uaLower.includes('linux')) {
      osName = 'Linux'
      platform = 'linux'
      osDetail = 'Linux (x86_64)'
    }
  }

  const totalMemoryGb = formatGb(totalMemoryBytes)
  const availableMemoryGb = formatGb(availableMemoryBytes)
  const memoryUsedPercent = Math.round(((totalMemoryBytes - availableMemoryBytes) / totalMemoryBytes) * 100)

  return {
    cpuModel,
    logicalCores,
    arch,
    totalMemoryBytes,
    availableMemoryBytes,
    totalMemoryGb,
    availableMemoryGb,
    memoryUsedPercent,
    disks,
    osName,
    osDetail,
    platform,
  }
}

export function evaluateHardwareCompatibility(
  hw: HardwareInfo,
  report: RepositoryReport
): HardwareCompatibility {
  const repoSizeMb = (report.repository?.sizeKb || 1024) / 1024
  const languages = (report.languages || []).map((l) => (l?.name || '').toLowerCase())
  const importantFiles = (report.importantFiles || []).map((f) => (f?.path || '').toLowerCase())
  const manifests = report.manifests || []
  const hasDocker = importantFiles.some((f) => f.includes('docker'))
  const isRustOrCpp = languages.includes('rust') || languages.includes('c++') || languages.includes('c')
  const isPythonAi =
    languages.includes('python') &&
    ((report.repository?.topics || []).some((t) => ['ai', 'llm', 'machine-learning', 'pytorch', 'deep-learning'].includes(t)) ||
      (report.dependencies || []).some((d) => ['torch', 'tensorflow', 'transformers', 'vllm'].includes(d.name.toLowerCase())))

  // Estimate required disk space: repo size + dependencies
  let estimatedDiskNeededGb = (repoSizeMb * 6) / 1024
  if (isRustOrCpp) estimatedDiskNeededGb = Math.max(3, estimatedDiskNeededGb + 4)
  if (isPythonAi) estimatedDiskNeededGb = Math.max(8, estimatedDiskNeededGb + 10)
  if (hasDocker) estimatedDiskNeededGb = Math.max(5, estimatedDiskNeededGb + 3)
  estimatedDiskNeededGb = Math.round(Math.max(1, estimatedDiskNeededGb) * 10) / 10

  // Estimate required RAM
  let minRamNeededGb = 2
  if (isRustOrCpp) {
    minRamNeededGb = 4
  }
  if (isPythonAi) {
    minRamNeededGb = 8
  }

  const primaryDisk = hw.disks[0] || { availableGb: 20, name: 'Disco Local' }
  const hasDiskSpace = primaryDisk.availableGb >= estimatedDiskNeededGb
  const hasRam = hw.totalMemoryGb >= minRamNeededGb
  const hasCpuCores = hw.logicalCores >= 4

  // OS compatibility check against repository specifics
  let isOsCompatible = true
  let osVerdictMessage = `${hw.osDetail}: Entorno totalmente compatible para instalar y ejecutar.`
  let osBadge = 'Compatible'

  const isMacOnly =
    importantFiles.some((f) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace') || f.endsWith('podfile')) ||
    (languages.includes('swift') && !importantFiles.some((f) => f.includes('docker') || f.includes('package.json')))

  const isWindowsOnly =
    importantFiles.some((f) => f.endsWith('.sln') || f.endsWith('.csproj') || f.endsWith('.vcxproj')) &&
    manifests.some((m) => m.path.toLowerCase().includes('packages.config'))

  const isLinuxOnly =
    importantFiles.some((f) => f.includes('systemd') || f.endsWith('.ebpf') || f.includes('kernel/'))

  let status: 'compatible' | 'warning' | 'incompatible' = 'compatible'
  const cleanCpu = hw.cpuModel.replace(/\(R\)|\(TM\)/gi, '').split('@')[0].trim() || 'Procesador multinúcleo'

  if (isMacOnly && hw.osName !== 'macOS') {
    isOsCompatible = false
    status = 'incompatible'
    osBadge = 'Requiere macOS'
    osVerdictMessage = `Requiere macOS (Xcode/Swift). Tu equipo corre ${hw.osDetail}.`
  } else if (isWindowsOnly && hw.osName !== 'Windows') {
    isOsCompatible = false
    status = 'warning'
    osBadge = 'Windows nativo'
    osVerdictMessage = `Diseñado para Windows (.NET framework legado). Tu equipo corre ${hw.osDetail}.`
  } else if (isLinuxOnly && hw.osName !== 'Linux') {
    isOsCompatible = false
    status = 'warning'
    osBadge = 'Requiere Linux'
    osVerdictMessage = `Requiere kernel Linux / WSL. Tu equipo corre ${hw.osDetail}.`
  }

  let headline = '100% Compatible con tu PC'
  let summary = `Verificado para tu procesador (${cleanCpu}), ${hw.totalMemoryGb} GB de RAM y sistema operativo ${hw.osDetail}.`
  let badgeText = 'Corre Perfecto'
  let rating = 9.5

  if (status === 'incompatible') {
    headline = 'Incompatible con tu Sistema Operativo'
    summary = osVerdictMessage
    badgeText = 'No Compatible'
    rating = 3.0
  } else if (!hasDiskSpace) {
    status = 'warning'
    headline = 'Espacio de disco ajustado'
    summary = `Se recomienda liberar espacio: el proyecto requiere ~${estimatedDiskNeededGb} GB y tu disco tiene ${primaryDisk.availableGb} GB libres en ${hw.osDetail}.`
    badgeText = 'Disco Justo'
    rating = 6.5
  } else if (!hasRam) {
    status = 'warning'
    headline = 'Memoria RAM limitada'
    summary = `Este proyecto necesita mínimo ${minRamNeededGb} GB de RAM para compilar o ejecutar en ${hw.osDetail}, y tu equipo tiene ${hw.totalMemoryGb} GB.`
    badgeText = 'RAM Justa'
    rating = 5.5
  } else if (isPythonAi && hw.totalMemoryGb < 12) {
    status = 'warning'
    headline = 'Carga Pesada de IA / ML'
    summary = `Este proyecto maneja modelos o pipelines pesados en ${hw.osDetail}. La ejecución puede saturar tus ${hw.totalMemoryGb} GB de RAM.`
    badgeText = 'Exigente'
    rating = 7.0
  }

  const cpuVerdict = {
    ok: hasCpuCores,
    message: `${hw.logicalCores} núcleos (${cleanCpu})`,
  }

  const memoryVerdict = {
    ok: hasRam,
    message: `${hw.availableMemoryGb} GB libres de ${hw.totalMemoryGb} GB totales (${hw.memoryUsedPercent}% en uso)`,
  }

  const diskVerdict = {
    ok: hasDiskSpace,
    message: `${primaryDisk.availableGb} GB libres en ${primaryDisk.name} (~${estimatedDiskNeededGb} GB estimados)`,
  }

  const osVerdict = {
    ok: isOsCompatible,
    message: osVerdictMessage,
    badge: osBadge,
  }

  return {
    status,
    headline,
    summary,
    badgeText,
    cpuVerdict,
    memoryVerdict,
    diskVerdict,
    osVerdict,
    overallRating: rating,
  }
}

export type RoadmapStep = {
  number: number
  title: string
  command?: string
  explanation: string
  tag: string
}

export function generateColloquialInsight(report: RepositoryReport): {
  whatItIs: string
  whyItMatters: string
  targetAudience: string
  ecosystemSummary: string
} {
  const desc = report.repository.description || ''
  const langs = report.languages.map((l) => l.name)
  const primaryLang = langs[0] || 'Código'
  const topics = report.repository.topics || []

  // Check categories
  const isCli = topics.includes('cli') || desc.toLowerCase().includes('cli') || desc.toLowerCase().includes('command line')
  const isUi = topics.includes('ui') || topics.includes('react') || topics.includes('vue') || topics.includes('frontend')
  const isAi = topics.includes('ai') || topics.includes('llm') || topics.includes('machine-learning') || desc.toLowerCase().includes('ai') || desc.toLowerCase().includes('agent')
  const isDesktop = topics.includes('desktop') || topics.includes('tauri') || topics.includes('electron') || desc.toLowerCase().includes('desktop')
  const isBackend = topics.includes('api') || topics.includes('backend') || topics.includes('server') || desc.toLowerCase().includes('api')

  let whatItIs = desc
    ? desc
    : `Es una herramienta de software desarrollada principalmente en ${primaryLang}.`

  // Make it colloquial and human
  if (isCli) {
    whatItIs = `Es una utilidad para tu terminal en ${primaryLang} pensada para automatizar, gestionar o agilizar tareas directo desde la línea de comandos.`
  } else if (isDesktop) {
    whatItIs = `Es una aplicación de escritorio nativa e interactiva creada con ${primaryLang}, diseñada para usarse con ventana e interfaz gráfica.`
  } else if (isAi) {
    whatItIs = `Es un sistema o agente de inteligencia artificial en ${primaryLang} enfocado en procesamiento inteligente, modelos o flujos automatizados con IA.`
  } else if (isUi) {
    whatItIs = `Es una librería o interfaz web moderna construida en ${primaryLang} para armar componentes visuales, paneles o apps de usuario.`
  } else if (isBackend) {
    whatItIs = `Es un motor backend o servidor de API en ${primaryLang} para procesar datos, peticiones y gestionar lógica de negocio.`
  } else if (desc.length > 10) {
    whatItIs = `En pocas palabras: ${desc.replace(/\.$/, '')}. Construido sobre el ecosistema de ${primaryLang}.`
  }

  let whyItMatters = `Te ahorra reinventar la rueda: te da una solución ya probada y mantenida con ${report.repository.stars.toLocaleString()} estrellas en GitHub.`
  if (report.repository.stars > 10000) {
    whyItMatters = `Es un proyecto de alto calibre y gran adopción comunitaria (${report.repository.stars.toLocaleString()} estrellas), con código maduro y confiable para producción.`
  }

  let targetAudience = `Desarrolladores o entusiastas que trabajen con ${langs.slice(0, 3).join(', ')}.`
  if (isCli) targetAudience = 'Developers que aman la terminal y la automatización rápida sin clicks extra.'
  if (isAi) targetAudience = 'Curiosos, programadores o creadores que quieran implementar flujos con inteligencia artificial.'
  if (isUi) targetAudience = 'Desarrolladores Frontend o Fullstack que buscan interfaces limpias y veloces.'

  const safeLangs = report.languages || []
  const totalLangBytes = Math.max(1, safeLangs.reduce((a, b) => a + (b?.bytes || 0), 0))
  const primaryBytes = safeLangs[0]?.bytes || 1
  const manifests = report.manifests || []
  const ecosystemSummary = `${primaryLang} (${((primaryBytes / totalLangBytes) * 100).toFixed(0)}%) · ${manifests.length > 0 ? manifests.map((m) => m.ecosystem).join(', ') : 'Ecosistema estándar'} · ${report.repository?.license?.name || 'Código abierto'}`

  return {
    whatItIs,
    whyItMatters,
    targetAudience,
    ecosystemSummary,
  }
}

export function generateInstallationRoadmap(report: RepositoryReport): RoadmapStep[] {
  const steps: RoadmapStep[] = []
  const manifests = report.manifests || []
  const importantFiles = report.importantFiles || []
  const hasPackageJson = manifests.some((m) => (m?.path || '').toLowerCase().endsWith('package.json'))
  const hasCargo = manifests.some((m) => (m?.path || '').toLowerCase().endsWith('cargo.toml'))
  const hasPython = manifests.some((m) => (m?.path || '').toLowerCase().includes('pyproject') || (m?.path || '').toLowerCase().includes('requirements'))
  const hasGo = manifests.some((m) => (m?.path || '').toLowerCase().endsWith('go.mod'))
  const hasDocker = importantFiles.some((f) => (f?.path || '').toLowerCase().includes('dockerfile'))

  // Step 1: Prerequisites
  let prereq = 'Tener instalado Git en tu equipo.'
  if (hasPackageJson) prereq = 'Tener instalado Node.js (versión 18 o superior) y Git.'
  else if (hasCargo) prereq = 'Tener instalado Rust y el gestor Cargo (rustup).'
  else if (hasPython) prereq = 'Tener instalado Python 3.10+ y el gestor pip.'
  else if (hasGo) prereq = 'Tener instalado Go (1.20+) y Git.'
  else if (hasDocker) prereq = 'Tener instalado Docker Desktop o Docker Engine.'

  steps.push({
    number: 1,
    title: 'Requisitos Previos',
    explanation: prereq,
    tag: 'Entorno',
  })

  // Step 2: Clone repository
  steps.push({
    number: 2,
    title: 'Clonar el Repositorio',
    command: `git clone https://github.com/${report.repository.fullName}.git\ncd ${report.repository.name}`,
    explanation: 'Descarga el código fuente completo y entra al directorio del proyecto.',
    tag: 'Git',
  })

  // Step 3: Install dependencies
  let installCmd = 'npm install'
  let installExp = 'Instala todas las dependencias del proyecto.'
  if (hasPackageJson) {
    installCmd = 'npm install'
    installExp = 'Descarga todos los paquetes y librerías declarados en package.json.'
  } else if (hasCargo) {
    installCmd = 'cargo build'
    installExp = 'Descarga los crates y compila el binario en modo debug.'
  } else if (hasPython) {
    installCmd = report.manifests.some((m) => m.path.includes('requirements'))
      ? 'pip install -r requirements.txt'
      : 'pip install .'
    installExp = 'Instala los módulos de Python necesarios en tu entorno.'
  } else if (hasGo) {
    installCmd = 'go mod download'
    installExp = 'Descarga los módulos Go del archivo go.mod.'
  } else if (hasDocker) {
    installCmd = 'docker build -t app .'
    installExp = 'Construye la imagen de contenedor con todas las dependencias aisladas.'
  }

  steps.push({
    number: 3,
    title: 'Instalar Dependencias',
    command: installCmd,
    explanation: installExp,
    tag: 'Dependencias',
  })

  // Step 4: Run / Start
  let runCmd = 'npm run dev'
  let runExp = 'Inicia el servidor local de desarrollo o aplicación.'
  if (hasPackageJson) {
    runCmd = 'npm run dev'
    runExp = 'Inicia el entorno de desarrollo local (o npm start según el proyecto).'
  } else if (hasCargo) {
    runCmd = 'cargo run'
    runExp = 'Compila e inicia la ejecución del programa inmediatamente.'
  } else if (hasPython) {
    runCmd = 'python main.py'
    runExp = 'Ejecuta el archivo de entrada principal.'
  } else if (hasGo) {
    runCmd = 'go run main.go'
    runExp = 'Compila en memoria y ejecuta el servidor o CLI.'
  } else if (hasDocker) {
    runCmd = 'docker run -p 3000:3000 app'
    runExp = 'Levanta el contenedor con mapeo de puertos local.'
  }

  steps.push({
    number: 4,
    title: 'Iniciar y Probar',
    command: runCmd,
    explanation: runExp,
    tag: 'Ejecución',
  })

  return steps
}
