import { useState } from 'react'
import { Copy, Check, Terminal, ExternalLink, Bot, CheckCircle2 } from 'lucide-react'
import type { RepositoryReport } from '../../features/repository/types'
import { generateInstallationRoadmap, type HardwareInfo, type RoadmapStep } from '../hardware'
import { t, type ActiveLocale } from '../i18n'
import { SpotlightCard } from './SpotlightCard'

type Props = {
  report: RepositoryReport
  hardware?: HardwareInfo | null
  locale?: ActiveLocale
}

function buildAgentPrompt(
  report: RepositoryReport,
  hardware: HardwareInfo | null | undefined,
  steps: RoadmapStep[],
  locale: ActiveLocale = 'es'
): string {
  const os = hardware?.osDetail || hardware?.osName || 'Windows'
  const cpu = hardware?.cpuModel?.replace(/\(R\)|\(TM\)/gi, '')?.split('@')?.[0]?.trim() || 'Multi-core CPU'
  const ram = hardware?.totalMemoryGb ? `${hardware.totalMemoryGb} GB (${hardware.availableMemoryGb} GB free)` : '8 GB'
  const disk = hardware?.disks?.[0]?.availableGb ? `${hardware.disks[0].availableGb} GB free` : 'Sufficient'

  if (locale === 'en') {
    return `Act as my senior software engineer assistant. I want to clone, configure, and run this GitHub repository locally on my machine:

📌 REPOSITORY:
- Name: ${report.repository.fullName}
- URL: ${report.repository.htmlUrl}
- Default branch: ${report.repository.defaultBranch}
- Stack / Languages: ${report.languages.map((l) => l.name).join(', ') || 'Native'}

💻 MY MACHINE ENVIRONMENT:
- Operating System: ${os}
- Processor: ${cpu} (${hardware?.logicalCores || 4} threads)
- RAM Memory: ${ram}
- Disk Space: ${disk}

🛠️ SUGGESTED INSTALLATION ROADMAP:
${steps.map((s) => `${s.number}. ${s.title}: ${s.command ? '`' + s.command + '`' : s.explanation}`).join('\n')}

🎯 INSTRUCTIONS:
1. Verify if I need any prerequisites installed on my ${os} terminal.
2. Guide me step-by-step with the exact commands to clone, install dependencies, and run the project.
3. If any typical dependency errors or build issues occur on ${os}, help me resolve them immediately.`
  }

  return `Actúa como mi asistente experto de programación. Quiero instalar, configurar y probar este repositorio en mi computadora:

📌 REPOSITORIO:
- Nombre: ${report.repository.fullName}
- URL: ${report.repository.htmlUrl}
- Rama: ${report.repository.defaultBranch}
- Stack / Lenguajes: ${report.languages.map((l) => l.name).join(', ') || 'Nativo'}

💻 ENTORNO DE MI MÁQUINA:
- Sistema Operativo: ${os}
- Procesador: ${cpu} (${hardware?.logicalCores || 4} hilos)
- Memoria RAM: ${ram}
- Espacio en disco: ${disk}

🛠️ ROADMAP SUGERIDO DE INSTALACIÓN:
${steps.map((s) => `${s.number}. ${s.title}: ${s.command ? '`' + s.command + '`' : s.explanation}`).join('\n')}

🎯 INSTRUCCIÓN:
1. Revisa los prerrequisitos necesarios para mi terminal de ${os}.
2. Guíame paso a paso con los comandos exactos para clonar, instalar dependencias y levantar el proyecto.
3. Si ocurre algún conflicto o error en ${os}, ayúdame a resolverlo de inmediato.`
}

import claudeLogoImg from '../icons/custom/claude.png'
import chatgptLogoImg from '../icons/custom/chatgpt.png'
import antigravityLogoImg from '../icons/custom/antigravity.webp'

// Official Brand Logos uploaded by user
function ClaudeLogo() {
  return (
    <img
      src={claudeLogoImg}
      alt="Claude"
      width={19}
      height={19}
      style={{ objectFit: 'contain', flexShrink: 0, borderRadius: 2 }}
    />
  )
}

function ChatGPTCodexLogo() {
  return (
    <img
      src={chatgptLogoImg}
      alt="ChatGPT"
      width={19}
      height={19}
      style={{ objectFit: 'contain', flexShrink: 0, borderRadius: 2 }}
    />
  )
}

function AntigravityLogo() {
  return (
    <img
      src={antigravityLogoImg}
      alt="Antigravity"
      width={19}
      height={19}
      style={{ objectFit: 'contain', flexShrink: 0, borderRadius: 2 }}
    />
  )
}

export function RoadmapView({ report, hardware, locale = 'es' }: Props) {
  const steps = generateInstallationRoadmap(report)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [launchedAgent, setLaunchedAgent] = useState<string | null>(null)

  const handleCopy = (command: string, index: number) => {
    navigator.clipboard.writeText(command).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  const triggerProtocol = (protocolUri: string) => {
    const a = document.createElement('a')
    a.href = protocolUri
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleLaunchAgent = async (agent: 'claude' | 'chatgpt' | 'antigravity') => {
    const prompt = buildAgentPrompt(report, hardware, steps, locale)
    await navigator.clipboard.writeText(prompt)
    setLaunchedAgent(agent)
    setTimeout(() => setLaunchedAgent(null), 4000)

    if (agent === 'chatgpt') {
      triggerProtocol('codex://')
    } else if (agent === 'antigravity') {
      triggerProtocol('antigravity://')
    } else if (agent === 'claude') {
      triggerProtocol('claude://')
    }
  }

  const agentDisplayName =
    launchedAgent === 'chatgpt'
      ? 'ChatGPT (Codex)'
      : launchedAgent === 'antigravity'
      ? 'Google Antigravity'
      : 'Claude'

  return (
    <SpotlightCard className="roadmap-card-wrapper" spotlightColor="rgba(46, 160, 67, 0.08)">
      <div style={{ padding: '12px 14px' }}>
        <div className="roadmap-top-bar">
          <div className="roadmap-title-group">
            <Terminal size={14} style={{ color: 'var(--text-secondary)' }} />
            <span className="roadmap-main-title">{t('roadmap_title', locale)}</span>
          </div>
          <span className="roadmap-quick-pill">{t('roadmap_quick_pill', locale)}</span>
        </div>

        {/* Ant Design Style Interactive Timeline */}
        <div className="timeline-roadmap-list">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1
            const isCopied = copiedIndex === idx
            return (
              <div key={step.number} className="timeline-roadmap-item">
                <div className="timeline-axis">
                  <div className={`timeline-bullet ${isCopied ? 'completed' : ''}`}>
                    {isCopied ? <Check size={11} /> : step.number}
                  </div>
                  {!isLast && <div className="timeline-track-line" />}
                </div>

                <div className="timeline-content-card">
                  <div className="roadmap-step-top">
                    <span className="roadmap-step-heading">{step.title}</span>
                    <span className="roadmap-step-category">{step.tag}</span>
                  </div>
                  <p className="roadmap-step-explanation" style={{ margin: '2px 0 0' }}>{step.explanation}</p>
                  {step.command && (
                    <div className="roadmap-terminal-box" style={{ marginTop: 6 }}>
                      <code className="roadmap-terminal-code">{step.command}</code>
                      <button
                        type="button"
                        className="roadmap-copy-action"
                        onClick={() => handleCopy(step.command!, idx)}
                        title={t('copy', locale)}
                      >
                        {isCopied ? (
                          <>
                            <Check size={12} className="text-emerald" />
                            <span className="text-emerald">{t('copied', locale)}</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>{t('copy', locale)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* AI Agents 1-Click Launch */}
        <div className="roadmap-agents-section" style={{ marginTop: 14 }}>
        <div className="roadmap-agents-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 11.5, color: 'var(--text-primary)' }}>
            <Bot size={14} style={{ color: 'var(--text-secondary)' }} />
            <span>{t('agents_launch_title', locale)}</span>
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t('agents_launch_sub', locale)}</span>
        </div>

        <p style={{ margin: '4px 0 10px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {t('agents_launch_desc', locale)}
        </p>

        <div className="roadmap-agents-grid">
          {/* ChatGPT / Codex */}
          <button
            type="button"
            className="btn-agent-launch agent-chatgpt"
            onClick={() => void handleLaunchAgent('chatgpt')}
            title="Open ChatGPT (Codex) desktop app with prompt ready"
          >
            <ChatGPTCodexLogo />
            <div className="agent-btn-text">
              <span className="agent-btn-name">ChatGPT (Codex)</span>
              <span className="agent-btn-sub">OpenAI Desktop</span>
            </div>
            <ExternalLink size={11} className="agent-btn-arrow" />
          </button>

          {/* Antigravity */}
          <button
            type="button"
            className="btn-agent-launch agent-antigravity"
            onClick={() => void handleLaunchAgent('antigravity')}
            title="Open Google Antigravity with prompt ready"
          >
            <AntigravityLogo />
            <div className="agent-btn-text">
              <span className="agent-btn-name">Antigravity</span>
              <span className="agent-btn-sub">Google Agent</span>
            </div>
            <ExternalLink size={11} className="agent-btn-arrow" />
          </button>

          {/* Claude */}
          <button
            type="button"
            className="btn-agent-launch agent-claude"
            onClick={() => void handleLaunchAgent('claude')}
            title="Open Claude Desktop with prompt ready"
          >
            <ClaudeLogo />
            <div className="agent-btn-text">
              <span className="agent-btn-name">Claude</span>
              <span className="agent-btn-sub">Anthropic Desktop</span>
            </div>
            <ExternalLink size={11} className="agent-btn-arrow" />
          </button>
        </div>

        {launchedAgent && (
          <div className="agent-toast-alert animate-fade-in">
            <CheckCircle2 size={14} className="text-emerald" style={{ flexShrink: 0 }} />
            <span>
              {t('agent_toast', locale, { agent: agentDisplayName })}
            </span>
          </div>
        )}
      </div>
    </div>
    </SpotlightCard>
  )
}
