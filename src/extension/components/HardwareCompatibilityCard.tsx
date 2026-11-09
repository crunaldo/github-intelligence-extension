import { Cpu, HardDrive, MemoryStick, CheckCircle2, AlertTriangle, XCircle, Activity, Monitor } from 'lucide-react'
import type { HardwareInfo, HardwareCompatibility } from '../hardware'
import { t, type ActiveLocale } from '../i18n'
import { SpotlightCard } from './SpotlightCard'

type Props = {
  hardware: HardwareInfo | null
  compat: HardwareCompatibility | null
  locale?: ActiveLocale
}

export function HardwareCompatibilityCard({ hardware, compat, locale = 'es' }: Props) {
  if (!hardware || !compat) {
    return (
      <div className="modern-card hw-loading-state">
        <Activity size={18} className="animate-spin text-cyan" />
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('hw_analyzing', locale)}</div>
      </div>
    )
  }

  const isCompatible = compat.status === 'compatible'
  const isWarning = compat.status === 'warning'

  const cleanCpu = hardware.cpuModel
    .replace(/\(R\)|\(TM\)/gi, '')
    .split('@')[0]
    .trim()

  const primaryDisk = hardware.disks[0] || {
    name: 'C:',
    availableGb: 50,
    totalGb: 256,
    usedPercent: 50,
  }

  const headline = isCompatible
    ? t('hw_perfect', locale)
    : compat.headline

  const badgeText = isCompatible
    ? t('hw_perfect_badge', locale)
    : compat.badgeText

  const summary = isCompatible
    ? locale === 'en'
      ? `Verified for your processor (${cleanCpu}), ${hardware.totalMemoryGb} GB RAM, and operating system ${hardware.osDetail || hardware.osName}.`
      : `Verificado para tu procesador (${cleanCpu}), ${hardware.totalMemoryGb} GB de RAM y sistema operativo ${hardware.osDetail || hardware.osName}.`
    : compat.summary

  return (
    <SpotlightCard className="modern-card hw-card-container" spotlightColor="rgba(255, 47, 90, 0.12)">
      {/* Top Compatibility Verdict Banner with Animated Status Icon */}
      <div className={`hw-verdict-box ${compat.status}`}>
        <div className="hw-verdict-left">
          <div className={`hw-animated-icon-halo ${compat.status}`}>
            <span className="hw-halo-ping" />
            <span className="hw-halo-core">
              {isCompatible ? (
                <CheckCircle2 size={24} className="hw-icon-good hw-icon-pulse" />
              ) : isWarning ? (
                <AlertTriangle size={24} className="hw-icon-warn hw-icon-pulse" />
              ) : (
                <XCircle size={24} className="hw-icon-bad hw-icon-pulse" />
              )}
            </span>
          </div>

          <div>
            <div className="hw-verdict-title">{headline}</div>
            <div className="hw-verdict-desc">{summary}</div>
          </div>
        </div>

        <div className={`hw-badge-status ${compat.status}`}>
          <span className="hw-pulse-indicator" />
          <span>{badgeText}</span>
        </div>
      </div>

      {/* 4 Hardware & OS Specs Columns */}
      <div className="hw-specs-grid-four">
        {/* CPU */}
        <div className="hw-spec-card">
          <div className="hw-spec-header">
            <Cpu size={14} className="hw-spec-icon-cpu" />
            <span className="hw-spec-tag">{t('hw_processor', locale)}</span>
          </div>
          <div className="hw-spec-main">{hardware.logicalCores} {t('hw_cores', locale)}</div>
          <div className="hw-spec-detail" title={hardware.cpuModel}>
            {cleanCpu || 'CPU'}
          </div>
        </div>

        {/* RAM */}
        <div className="hw-spec-card">
          <div className="hw-spec-header">
            <MemoryStick size={14} className="hw-spec-icon-ram" />
            <span className="hw-spec-tag">{t('hw_ram', locale)}</span>
          </div>
          <div className="hw-spec-main">{hardware.totalMemoryGb} GB {t('hw_total', locale)}</div>
          <div className="hw-spec-detail">
            {hardware.availableMemoryGb} GB {t('hw_free', locale)} ({hardware.memoryUsedPercent}% {t('hw_in_use', locale)})
          </div>
          <div className="hw-bar-track">
            <div
              className={`hw-bar-fill ${hardware.memoryUsedPercent > 85 ? 'fill-bad' : 'fill-ram'}`}
              style={{ width: `${hardware.memoryUsedPercent}%` }}
            />
          </div>
        </div>

        {/* Disk */}
        <div className="hw-spec-card">
          <div className="hw-spec-header">
            <HardDrive size={14} className="hw-spec-icon-disk" />
            <span className="hw-spec-tag">{t('hw_disk', locale)}</span>
          </div>
          <div className="hw-spec-main">{primaryDisk.availableGb} GB {t('hw_free', locale)}</div>
          <div className="hw-spec-detail">
            {t('hw_in_disk', locale)} {primaryDisk.name} ({primaryDisk.totalGb} GB)
          </div>
          <div className="hw-bar-track">
            <div
              className={`hw-bar-fill ${primaryDisk.usedPercent > 90 ? 'fill-bad' : 'fill-disk'}`}
              style={{ width: `${primaryDisk.usedPercent}%` }}
            />
          </div>
        </div>

        {/* Sistema Operativo */}
        <div className="hw-spec-card">
          <div className="hw-spec-header">
            <Monitor size={14} className="hw-spec-icon-os" />
            <span className="hw-spec-tag">{t('hw_os', locale)}</span>
          </div>
          <div className="hw-spec-main">{hardware.osDetail || hardware.osName}</div>
          <div className="hw-spec-detail">
            {compat.osVerdict?.message || `${hardware.osName} detected`}
          </div>
          <div className="hw-bar-track" style={{ height: 4, marginTop: 6, background: compat.osVerdict?.ok ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 'var(--radius-full)',
                background: compat.osVerdict?.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Recommendation notes */}
      {Boolean(compat.recommendations && compat.recommendations.length > 0) && (
        <div className="hw-notes-box">
          <div className="hw-notes-title">{t('hw_recommendation', locale)}</div>
          <ul className="hw-notes-list">
            {(compat.recommendations || []).map((rec: string, i: number) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </SpotlightCard>
  )
}
