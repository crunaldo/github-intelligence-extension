import React from 'react'
import type { RepositoryReport } from '../../features/repository/types'

export type MascotMood =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'cool'
  | 'sparkle'
  | 'thinking'
  | 'investigating'
  | 'coding'
  | 'warning'
  | 'error'
  | 'loading'
  | 'sleepy'
  | 'confused'
  | 'worried'

interface MascotInfo {
  filename: string
  alt: string
  mood: MascotMood
}

export function determineAnalysisMascot(options: {
  report?: RepositoryReport | null
  loading?: boolean
  error?: string | boolean | null
  override?: MascotMood
}): MascotInfo {
  if (options.override) {
    const map: Record<MascotMood, string> = {
      neutral: '01_neutral.svg',
      happy: '02_happy.svg',
      excited: '04_excited.svg',
      cool: '06_cool.svg',
      sparkle: '07_sparkle_eyes.svg',
      thinking: '09_thinking.svg',
      investigating: '10_investigating.svg',
      coding: '12_coding.svg',
      sleepy: '15_sleepy.svg',
      worried: '17_worried.svg',
      confused: '20_confused.svg',
      warning: '21_warning.svg',
      error: '23_error.svg',
      loading: '24_loading.svg',
    }
    return {
      filename: map[options.override] || '01_neutral.svg',
      alt: `Mascota ${options.override}`,
      mood: options.override,
    }
  }

  if (options.loading) {
    return {
      filename: '24_loading.svg',
      alt: 'Analizando repositorio...',
      mood: 'loading',
    }
  }

  if (options.error) {
    return {
      filename: '23_error.svg',
      alt: 'Error o repositorio no disponible',
      mood: 'error',
    }
  }

  const r = options.report
  if (r) {
    // 1. Repositorio archivado
    if (r.repository.archived) {
      return {
        filename: '15_sleepy.svg',
        alt: 'Repositorio archivado',
        mood: 'sleepy',
      }
    }

    // 2. Vulnerabilidades críticas detectadas
    const vulnList = (r as unknown as { vulnerabilities?: unknown[] }).vulnerabilities
    if (Array.isArray(vulnList) && vulnList.length > 0) {
      return {
        filename: '21_warning.svg',
        alt: 'Atención: vulnerabilidades detectadas',
        mood: 'warning',
      }
    }

    // 3. Repositorio de alta tracción y popularidad (como vercel/next.js en el diseño oficial)
    if (r.repository.stars >= 2500) {
      return {
        filename: '04_excited.svg',
        alt: 'Repositorio muy popular y de alta tracción',
        mood: 'excited',
      }
    }

    // 4. Repositorio destacado en crecimiento
    if (r.repository.stars >= 500) {
      return {
        filename: '07_sparkle_eyes.svg',
        alt: 'Repositorio en crecimiento',
        mood: 'sparkle',
      }
    }

    // 6. Repositorio saludable / activo
    return {
      filename: '02_happy.svg',
      alt: 'Repositorio activo',
      mood: 'happy',
    }
  }

  return {
    filename: '01_neutral.svg',
    alt: 'GitHub Intelligence Assistant',
    mood: 'neutral',
  }
}

export function getMascotAssetUrl(filename: string): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(`icons/mascot/${filename}`)
    }
  } catch {
    // ignore
  }
  return `./icons/mascot/${filename}`
}

export interface AnalysisMascotProps {
  report?: RepositoryReport | null
  loading?: boolean
  error?: string | boolean | null
  moodOverride?: MascotMood
  size?: number
  className?: string
  showBadge?: boolean
}

export const AnalysisMascot: React.FC<AnalysisMascotProps> = ({
  report,
  loading,
  error,
  moodOverride,
  size = 72,
  className = '',
  showBadge = false,
}) => {
  const { filename, alt, mood } = determineAnalysisMascot({
    report,
    loading,
    error,
    override: moodOverride,
  })

  const src = getMascotAssetUrl(filename)

  return (
    <div
      className={`analysis-mascot-container mood-${mood} ${className}`}
      style={{ width: size, height: size }}
      title={alt}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="analysis-mascot-img"
        loading="eager"
        decoding="async"
      />
      {showBadge && mood === 'excited' && (
        <span className="mascot-mood-pill">¡Top!</span>
      )}
      {showBadge && mood === 'cool' && (
        <span className="mascot-mood-pill">Legendario</span>
      )}
      {showBadge && mood === 'warning' && (
        <span className="mascot-mood-pill pill-warn">Alerta</span>
      )}
    </div>
  )
}
