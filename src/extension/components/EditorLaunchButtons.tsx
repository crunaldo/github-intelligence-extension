import { useState } from 'react'
import { Code, ExternalLink, Check, Zap, Cloud, Laptop } from 'lucide-react'
import type { ActiveLocale } from '../i18n'

type EditorLaunchButtonsProps = {
  repoUrl: string
  fullName: string
  locale?: ActiveLocale
}

export function EditorLaunchButtons({ repoUrl, fullName, locale = 'es' }: EditorLaunchButtonsProps) {
  const isEs = locale === 'es'
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleLaunchLocal = async (editor: 'vscode' | 'cursor') => {
    const cloneCommand = `git clone ${repoUrl}.git`
    try {
      await navigator.clipboard.writeText(cloneCommand)
    } catch {
      // Fallback
    }

    const scheme = editor === 'cursor' ? 'cursor' : 'vscode'
    const deepLinkUrl = `${scheme}://vscode.git/clone?url=${encodeURIComponent(repoUrl)}`

    const link = document.createElement('a')
    link.href = deepLinkUrl
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    const editorName = editor === 'cursor' ? 'Cursor' : 'VS Code'
    setFeedback(
      isEs
        ? `¡Abriendo ${editorName} y clonando repositorio!`
        : `Opening ${editorName} to clone repository!`
    )
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleLaunchCloud = (target: 'stackblitz' | 'codespaces' | 'githubdev') => {
    let url = ''
    let name = ''

    if (target === 'stackblitz') {
      url = `https://stackblitz.com/github/${fullName}`
      name = 'StackBlitz'
    } else if (target === 'codespaces') {
      url = `https://github.com/codespaces/new/${fullName}`
      name = 'GitHub Codespaces'
    } else {
      url = `https://github.dev/${fullName}`
      name = 'github.dev'
    }

    window.open(url, '_blank')
    setFeedback(
      isEs
        ? `Abriendo ${name} en la nube...`
        : `Opening ${name} in cloud sandbox...`
    )
    setTimeout(() => setFeedback(null), 2500)
  }

  return (
    <div className="editor-launch-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Code size={14} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)' }}>
            {isEs ? 'Abrir en Editor o Probar en la Nube' : 'Open in Editor or Run in Cloud'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {isEs ? '1-clic directo' : '1-click direct'}
        </span>
      </div>

      {/* Local Editors Group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="editor-group-row">
          <span className="editor-group-label">
            <Laptop size={11} /> {isEs ? 'Local' : 'Local'}
          </span>
          <div className="editor-group-buttons">
            {/* VS Code */}
            <button
              type="button"
              className="btn-editor-launch btn-vscode"
              onClick={() => void handleLaunchLocal('vscode')}
              title={isEs ? 'Clonar y abrir en VS Code' : 'Clone & open in VS Code'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.94-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
              </svg>
              <span>VS Code</span>
            </button>

            {/* Cursor */}
            <button
              type="button"
              className="btn-editor-launch btn-cursor"
              onClick={() => void handleLaunchLocal('cursor')}
              title={isEs ? 'Clonar y abrir en Cursor IDE' : 'Clone & open in Cursor IDE'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.53 2C6.27 2 2 6.27 2 11.53c0 5.26 4.27 9.53 9.53 9.53 5.26 0 9.53-4.27 9.53-9.53C21.06 6.27 16.79 2 11.53 2zm0 17.06c-4.16 0-7.53-3.37-7.53-7.53 0-4.16 3.37-7.53 7.53-7.53 4.16 0 7.53 3.37 7.53 7.53 0 4.16-3.37 7.53-7.53 7.53zm-1.07-12.8v10.54l6.4-5.27-6.4-5.27z" />
              </svg>
              <span>Cursor</span>
            </button>
          </div>
        </div>

        {/* Cloud Sandbox Group */}
        <div className="editor-group-row">
          <span className="editor-group-label">
            <Cloud size={11} /> {isEs ? 'Nube' : 'Cloud'}
          </span>
          <div className="editor-group-buttons">
            {/* StackBlitz */}
            <button
              type="button"
              className="btn-editor-launch btn-stackblitz"
              onClick={() => handleLaunchCloud('stackblitz')}
              title={isEs ? 'Ejecutar instantáneamente en StackBlitz (sin clonar)' : 'Instant sandbox run on StackBlitz (zero clone)'}
            >
              <Zap size={12} style={{ color: '#0ea5e9' }} />
              <span>StackBlitz</span>
            </button>

            {/* Codespaces */}
            <button
              type="button"
              className="btn-editor-launch btn-codespaces"
              onClick={() => handleLaunchCloud('codespaces')}
              title={isEs ? 'Crear contenedor en GitHub Codespaces' : 'Create container on GitHub Codespaces'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#2ea043' }}>
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Codespaces</span>
            </button>

            {/* github.dev */}
            <button
              type="button"
              className="btn-editor-launch btn-web"
              onClick={() => handleLaunchCloud('githubdev')}
              title={isEs ? 'Abrir VS Code Web (.dev)' : 'Open VS Code Web (.dev)'}
            >
              <ExternalLink size={12} />
              <span>Web (.dev)</span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="editor-feedback-toast animate-fade-in">
          <Check size={12} style={{ color: 'var(--accent-emerald)' }} />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  )
}
