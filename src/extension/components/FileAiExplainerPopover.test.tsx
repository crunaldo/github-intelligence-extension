// @vitest-environment happy-dom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { FileAiExplainerPopover } from './FileAiExplainerPopover'
import * as explanationService from '../utils/fileExplanationService'

// Configure React 19 act environment for happy-dom
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('FileAiExplainerPopover', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders explanation details with quota badge for free user', async () => {
    vi.spyOn(explanationService, 'explainFileWithAi').mockResolvedValueOnce({
      explanation: {
        summary: 'Punto de entrada de la aplicación',
        keyResponsibilities: ['Inicializa servicios', 'Monta el DOM'],
        architectureRole: 'Bootstrap neurálgico',
      },
      remainingToday: 2,
    })

    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <FileAiExplainerPopover
          filePath="src/index.ts"
          owner="facebook"
          repo="react"
          isPro={false}
          onClose={() => {}}
        />
      )
    })

    // Allow promise resolution
    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container.textContent).toContain('Punto de entrada de la aplicación')
    expect(container.textContent).toContain('Inicializa servicios')
    expect(container.textContent).toContain('Bootstrap neurálgico')
    expect(container.textContent).toContain('2 consultas gratuitas hoy')
  })

  it('renders Pro unlimited badge for Pro user', async () => {
    vi.spyOn(explanationService, 'explainFileWithAi').mockResolvedValueOnce({
      explanation: {
        summary: 'Configuración de paquetes',
        keyResponsibilities: ['Gestiona dependencias'],
        architectureRole: 'Configuración',
      },
      remainingToday: Infinity,
    })

    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <FileAiExplainerPopover
          filePath="package.json"
          owner="facebook"
          repo="react"
          isPro={true}
          onClose={() => {}}
        />
      )
    })

    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container.textContent).toContain('PRO Ilimitado')
  })

  it('renders upgrade prompt when quota is exhausted', async () => {
    vi.spyOn(explanationService, 'explainFileWithAi').mockRejectedValueOnce(
      new Error('Has alcanzado el límite de tu cuota diaria de 3 explicaciones gratuitas')
    )

    const root = createRoot(container)
    await React.act(async () => {
      root.render(
        <FileAiExplainerPopover
          filePath="package.json"
          owner="facebook"
          repo="react"
          isPro={false}
          onClose={() => {}}
        />
      )
    })

    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container.textContent).toContain('Límite Diario Alcanzado')
    expect(container.textContent).toContain('Actualizar a PRO')
  })
})
