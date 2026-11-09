import React from 'react'
import ReactDOM from 'react-dom/client'
import { PopupApp } from './PopupApp'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../extension.css'

const rootEl = document.getElementById('popup-root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Error al cargar la extensión">
        <PopupApp />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
