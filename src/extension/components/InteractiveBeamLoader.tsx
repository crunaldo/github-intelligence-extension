import { useState, useEffect } from 'react'
import { FolderGit2, ShieldCheck, FileCode2, Scale, Sparkles, CheckCircle2 } from 'lucide-react'
import type { ActiveLocale } from '../i18n'

type Props = {
  repoName?: string
  locale?: ActiveLocale
}

export function InteractiveBeamLoader({ repoName, locale = 'es' }: Props) {
  const isEs = locale === 'es'
  const [activeStep, setActiveStep] = useState<number>(0)

  useEffect(() => {
    const timer1 = setTimeout(() => setActiveStep(1), 250)
    const timer2 = setTimeout(() => setActiveStep(2), 550)
    const timer3 = setTimeout(() => setActiveStep(3), 850)
    const timer4 = setTimeout(() => setActiveStep(4), 1150)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
    }
  }, [])

  const pods = [
    {
      id: 1,
      title: isEs ? 'Árbol & Archivos' : 'Code Tree & Files',
      desc: isEs ? 'Estructura raíz y manifiestos' : 'Root structure & manifests',
      icon: <FolderGit2 size={13} />,
      color: '#38bdf8',
    },
    {
      id: 2,
      title: isEs ? 'Dependencias' : 'Dependencies',
      desc: isEs ? 'Ecosistemas y librerías' : 'Ecosystems & packages',
      icon: <FileCode2 size={13} />,
      color: '#a78bfa',
    },
    {
      id: 3,
      title: isEs ? 'Auditoría OSV.dev' : 'OSV.dev Audit',
      desc: isEs ? 'Base de datos de CVEs' : 'Known vulnerability DB',
      icon: <ShieldCheck size={13} />,
      color: '#2ea043',
    },
    {
      id: 4,
      title: isEs ? 'Licencia Comercial' : 'Commercial License',
      desc: isEs ? 'Permisos y limitaciones SPDX' : 'SPDX permissions & terms',
      icon: <Scale size={13} />,
      color: '#f59e0b',
    },
    {
      id: 5,
      title: isEs ? 'Síntesis & Arquitectura IA' : 'AI Architecture & Synthesis',
      desc: isEs ? 'Análisis generativo y auditoría profunda' : 'Generative analysis & deep audit',
      icon: <Sparkles size={13} />,
      color: '#06b6d4',
    },
  ]

  return (
    <div className="beam-loader-container animate-fade-in">
      {/* Top Header Card */}
      <div className="beam-loader-header">
        <div className="beam-center-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          <div className="beam-pulse-ring" />
        </div>
        <div className="beam-header-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
              {repoName || (isEs ? 'Extrayendo Inteligencia...' : 'Extracting Intelligence...')}
            </span>
            <Sparkles size={12} style={{ color: '#2ea043' }} className="animate-pulse" />
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            {isEs ? 'Auditoría paralela de código, dependencias y seguridad' : 'Parallel scan of code, packages and security'}
          </span>
        </div>
      </div>

      {/* Visual Animated Pipeline Pods */}
      <div className="beam-pods-grid">
        {pods.map((pod) => {
          const isDone = activeStep >= pod.id
          const isCurrent = activeStep === pod.id - 1
          return (
            <div
              key={pod.id}
              className={`beam-pod-card ${isDone ? 'is-complete' : isCurrent ? 'is-scanning' : 'is-pending'}`}
            >
              <div className="beam-pod-indicator" style={{ color: pod.color }}>
                {isDone ? <CheckCircle2 size={13} style={{ color: '#2ea043' }} /> : pod.icon}
              </div>
              <div className="beam-pod-body">
                <span className="beam-pod-title">{pod.title}</span>
                <span className="beam-pod-desc">{pod.desc}</span>
              </div>
              <div className="beam-pod-status">
                {isDone ? (
                  <span className="beam-badge-ready">{isEs ? 'Listo' : 'Ready'}</span>
                ) : (
                  <span className="beam-badge-running" style={{ color: pod.color }}>
                    <span className="beam-pulse-dot" style={{ background: pod.color, boxShadow: `0 0 6px ${pod.color}` }} />
                    {pod.id === 5
                      ? (isEs ? 'Analizando con IA...' : 'Analyzing with AI...')
                      : (isEs ? 'Escaneando' : 'Scanning')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
