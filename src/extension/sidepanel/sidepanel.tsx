import React from 'react'
import ReactDOM from 'react-dom/client'
import { SidepanelApp } from './SidepanelApp'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../extension.css'

const rootEl = document.getElementById('sidepanel-root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Error al cargar el Panel Lateral">
        <SidepanelApp />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
