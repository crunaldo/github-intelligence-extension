import React from 'react'
import ReactDOM from 'react-dom/client'
import { SidepanelApp } from '@/src/extension/sidepanel/SidepanelApp'
import '@/src/extension/extension.css'

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SidepanelApp />
    </React.StrictMode>
  )
}
