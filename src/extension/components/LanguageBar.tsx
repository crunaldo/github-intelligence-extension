import { useMemo } from 'react'
import { getLanguageColor } from '../../features/repository/github'

type LanguageBarProps = {
  languages: Array<{ name: string; bytes: number }>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LanguageBar({ languages = [] }: LanguageBarProps) {
  const safeLangs = languages || []
  const totalBytes = useMemo(() => safeLangs.reduce((acc, lang) => acc + (lang?.bytes || 0), 0), [safeLangs])

  const breakdown = useMemo(() => {
    if (!totalBytes) return []
    return safeLangs.map((lang) => {
      const percentage = (lang.bytes / totalBytes) * 100
      return {
        name: lang.name,
        bytes: lang.bytes,
        percentage: percentage < 0.1 ? '< 0.1%' : `${percentage.toFixed(1)}%`,
        rawPercent: percentage,
        color: getLanguageColor(lang.name),
      }
    })
  }, [safeLangs, totalBytes])

  if (!breakdown || !breakdown.length) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No language statistics available</div>
  }

  return (
    <div className="lang-bar-container">
      <div className="lang-bar-track">
        {breakdown.map((item) => (
          <div
            key={item.name}
            className="lang-bar-seg"
            style={{
              width: `${item.rawPercent}%`,
              backgroundColor: item.color,
            }}
            title={`${item.name}: ${item.percentage} (${formatBytes(item.bytes)})`}
          />
        ))}
      </div>
      <div className="lang-legend-list">
        {breakdown.slice(0, 6).map((item) => (
          <div key={item.name} className="lang-legend-item">
            <span className="lang-dot" style={{ backgroundColor: item.color }} />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</span>
            <span>{item.percentage}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
