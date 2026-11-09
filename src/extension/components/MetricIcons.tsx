// Premium Modern Icons for GitHub Metrics (Stars, Forks, Issues, Size)
import starsIco from '../icons/custom/stars.ico'
import issuesIco from '../icons/custom/issues.ico'
import storageIco from '../icons/custom/storage.ico'

export function ModernStarIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      src={starsIco}
      alt="Stars"
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  )
}

export function ModernForkIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <path
        d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3"
        stroke="#818cf8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 12v9"
        stroke="#818cf8"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="3" r="2.8" fill="var(--bg-app)" stroke="#818cf8" strokeWidth="2" />
      <circle cx="18" cy="3" r="2.8" fill="var(--bg-app)" stroke="#818cf8" strokeWidth="2" />
      <circle cx="12" cy="21" r="2.8" fill="var(--bg-app)" stroke="#818cf8" strokeWidth="2" />
    </svg>
  )
}

export function ModernIssueIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      src={issuesIco}
      alt="Issues"
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  )
}

export function ModernSizeIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      src={storageIco}
      alt="Storage"
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  )
}
