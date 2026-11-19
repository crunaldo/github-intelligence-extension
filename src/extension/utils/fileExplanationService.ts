export interface FileExplanation {
  summary: string
  keyResponsibilities: string[]
  architectureRole: string
}

export interface QuotaStatus {
  canExplain: boolean
  remainingToday: number
  isPro: boolean
}

export const FREE_DAILY_FILE_EXPLANATIONS_LIMIT = 3
const STORAGE_FILE_QUOTA_KEY = 'gpi_file_explanation_quota'
const STORAGE_FILE_CACHE_PREFIX = 'gpi_file_explain_cache_'

// In-memory fallback for testing environments
let memoryQuotaStore: { date: string; used: number } = {
  date: getTodayDateString(),
  used: 0,
}
const memoryFileCache = new Map<string, FileExplanation>()

function getTodayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function getStoredQuota(): Promise<{ date: string; used: number }> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const data = await chrome.storage.local.get(STORAGE_FILE_QUOTA_KEY)
      const stored = data?.[STORAGE_FILE_QUOTA_KEY] as { date?: string; used?: number } | undefined
      if (stored && typeof stored.used === 'number' && typeof stored.date === 'string') {
        return { date: stored.date, used: stored.used }
      }
    } catch {
      // fallback to memory
    }
  }
  return memoryQuotaStore
}

async function saveStoredQuota(quota: { date: string; used: number }): Promise<void> {
  memoryQuotaStore = quota
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [STORAGE_FILE_QUOTA_KEY]: quota })
    } catch {
      // ignore
    }
  }
}

export async function resetFileQuotaForTesting(): Promise<void> {
  memoryQuotaStore = {
    date: getTodayDateString(),
    used: 0,
  }
  memoryFileCache.clear()
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      await chrome.storage.local.remove(STORAGE_FILE_QUOTA_KEY)
    } catch {
      // ignore
    }
  }
}

export async function checkFileExplanationQuota(isPro: boolean): Promise<QuotaStatus> {
  if (isPro) {
    return {
      canExplain: true,
      remainingToday: Infinity,
      isPro: true,
    }
  }

  const today = getTodayDateString()
  const quota = await getStoredQuota()

  let used = quota.used
  if (quota.date !== today) {
    used = 0
    await saveStoredQuota({ date: today, used: 0 })
  }

  const remaining = Math.max(0, FREE_DAILY_FILE_EXPLANATIONS_LIMIT - used)
  return {
    canExplain: remaining > 0,
    remainingToday: remaining,
    isPro: false,
  }
}

export async function explainFileWithAi(params: {
  owner: string
  repo: string
  path: string
  ref?: string
  isPro: boolean
  fileSnippet?: string
}): Promise<{ explanation: FileExplanation; remainingToday: number }> {
  const { owner, repo, path, isPro } = params
  const cacheKey = `${owner}/${repo}/${path}`

  // Check cache first
  if (memoryFileCache.has(cacheKey)) {
    const quota = await checkFileExplanationQuota(isPro)
    return {
      explanation: memoryFileCache.get(cacheKey)!,
      remainingToday: quota.remainingToday,
    }
  }

  // Verify quota
  const quota = await checkFileExplanationQuota(isPro)
  if (!quota.canExplain) {
    throw new Error('Has alcanzado el límite de tu cuota diaria de 3 explicaciones gratuitas de archivo. Actualiza a PRO para análisis ilimitado.')
  }

  // Generate explanation based on file characteristics
  const explanation = generateHeuristicExplanation(path, repo)

  // Cache result
  memoryFileCache.set(cacheKey, explanation)

  // Decrement quota for free users
  let remainingToday = Infinity
  if (!isPro) {
    const currentQuota = await getStoredQuota()
    const today = getTodayDateString()
    const currentUsed = currentQuota.date === today ? currentQuota.used : 0
    const newUsed = currentUsed + 1
    await saveStoredQuota({ date: today, used: newUsed })
    remainingToday = Math.max(0, FREE_DAILY_FILE_EXPLANATIONS_LIMIT - newUsed)
  }

  return {
    explanation,
    remainingToday,
  }
}

function generateHeuristicExplanation(filePath: string, repoName: string): FileExplanation {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const fileName = normalized.split('/').pop() || ''
  const ext = fileName.split('.').pop() || ''

  if (fileName === 'package.json') {
    return {
      summary: `Manifiesto principal de dependencias, scripts de ejecución y metadatos de Node.js para ${repoName}.`,
      keyResponsibilities: [
        'Define las librerías de producción y herramientas de desarrollo requeridas.',
        'Contiene comandos de build, testeo y ejecución del proyecto.',
      ],
      architectureRole: 'Configuración central del runtime y árbol de dependencias.',
    }
  }

  if (fileName.startsWith('tsconfig')) {
    return {
      summary: 'Configuración del compilador TypeScript y reglas de chequeo de tipos estrictos.',
      keyResponsibilities: [
        'Establece rutas de resolución de módulos y versión de ECMAScript destino.',
        'Habilita flags de seguridad y tipado estricto.',
      ],
      architectureRole: 'Gobernanza del sistema de tipos estático.',
    }
  }

  if (fileName.startsWith('docker') || fileName.startsWith('container')) {
    return {
      summary: 'Receta de contenedorización para empaquetar y aislar la aplicación de forma reproducible.',
      keyResponsibilities: [
        'Define la imagen base del sistema operativo y herramientas necesarias.',
        'Expone puertos de red y configura el comando de inicio en producción.',
      ],
      architectureRole: 'Infraestructura de despliegue y portabilidad.',
    }
  }

  if (fileName.includes('index') || fileName.includes('main') || fileName.includes('app')) {
    return {
      summary: `Punto de entrada neurálgico (${fileName}) para la ejecución o bootstrap de la aplicación.`,
      keyResponsibilities: [
        'Inicializa servicios centrales, clientes de red y montado del DOM/servidor.',
        'Exporta la interfaz pública del paquete o renderiza la vista raíz.',
      ],
      architectureRole: 'Módulo de arranque (Bootstrap) y cableado de dependencias.',
    }
  }

  if (fileName.includes('test') || fileName.includes('spec')) {
    return {
      summary: `Suite de pruebas automatizadas para verificar contratos y evitar regresiones en ${fileName.replace(/\.(test|spec)\.[^.]+$/, '')}.`,
      keyResponsibilities: [
        'Valida comportamientos esperados y casos extremos.',
        'Asegura la estabilidad del código durante refactorizaciones.',
      ],
      architectureRole: 'Aseguramiento de calidad (QA) y cobertura de código.',
    }
  }

  return {
    summary: `Módulo de código fuente (${fileName}) que implementa lógica interna para ${repoName}.`,
    keyResponsibilities: [
      `Encapsula funciones y utilidades especializadas asociadas a .${ext}.`,
      'Colabora con el resto de módulos del directorio para proveer servicios específicos.',
    ],
    architectureRole: 'Capa de lógica de negocio o utilidades de soporte.',
  }
}
