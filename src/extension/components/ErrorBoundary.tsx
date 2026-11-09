import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  fallbackTitle?: string
}

type State = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error capturado por ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 250,
            textAlign: 'center',
            background: 'var(--bg-app)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(244, 63, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-rose)',
              marginBottom: 12,
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>
            {this.props.fallbackTitle || 'Ocurrió un error inesperado al renderizar el panel'}
          </h3>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              maxWidth: 320,
              margin: '0 0 14px',
              lineHeight: 1.45,
            }}
          >
            {this.state.error?.message || 'Error de ejecución en la extensión.'}
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{ gap: 6 }}
          >
            <RefreshCw size={13} />
            <span>Recargar Panel</span>
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
