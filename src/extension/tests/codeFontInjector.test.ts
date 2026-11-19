// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  applyCodeFontSettings,
  removeCodeFontSettings,
  CODE_FONT_STYLE_ID,
} from '../content/codeFontInjector'
import { DEFAULT_CODE_TREE_PREFERENCES, type CodeTreePreferences } from '../storage'

describe('codeFontInjector', () => {
  beforeEach(() => {
    removeCodeFontSettings()
  })

  afterEach(() => {
    removeCodeFontSettings()
  })

  it('injects JetBrains Mono with custom size and ligatures enabled', () => {
    const prefs: CodeTreePreferences = {
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'jetbrains',
      codeFontSize: 15,
      codeFontLigatures: true,
    }

    applyCodeFontSettings(prefs)

    const styleEl = document.getElementById(CODE_FONT_STYLE_ID) as HTMLStyleElement | null
    expect(styleEl).not.toBeNull()
    const css = styleEl?.textContent || ''

    expect(css).toContain('JetBrains Mono')
    expect(css).toContain('font-size: 15px !important')
    expect(css).toContain('font-variant-ligatures: normal !important')
    expect(css).toContain('.blob-code')
    expect(css).toContain('.react-code-text')
  })

  it('injects Fira Code with ligatures disabled', () => {
    const prefs: CodeTreePreferences = {
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'fira',
      codeFontSize: 14,
      codeFontLigatures: false,
    }

    applyCodeFontSettings(prefs)

    const styleEl = document.getElementById(CODE_FONT_STYLE_ID) as HTMLStyleElement | null
    expect(styleEl).not.toBeNull()
    const css = styleEl?.textContent || ''

    expect(css).toContain('Fira Code')
    expect(css).toContain('font-size: 14px !important')
    expect(css).toContain('font-variant-ligatures: none !important')
  })

  it('updates existing style tag without creating duplicate tags', () => {
    applyCodeFontSettings({
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'jetbrains',
      codeFontSize: 12,
    })

    applyCodeFontSettings({
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'cascadia',
      codeFontSize: 16,
    })

    const styleEls = document.querySelectorAll(`style#${CODE_FONT_STYLE_ID}`)
    expect(styleEls.length).toBe(1)
    expect(styleEls[0]?.textContent).toContain('Cascadia Code')
    expect(styleEls[0]?.textContent).toContain('font-size: 16px !important')
  })

  it('removes style tag when removeCodeFontSettings is called', () => {
    applyCodeFontSettings({
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'source-code',
      codeFontSize: 14,
    })

    expect(document.getElementById(CODE_FONT_STYLE_ID)).not.toBeNull()

    removeCodeFontSettings()
    expect(document.getElementById(CODE_FONT_STYLE_ID)).toBeNull()
  })

  it('removes style tag when codeFontFamily is default and default size is used', () => {
    applyCodeFontSettings({
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'jetbrains',
      codeFontSize: 14,
    })

    expect(document.getElementById(CODE_FONT_STYLE_ID)).not.toBeNull()

    applyCodeFontSettings({
      ...DEFAULT_CODE_TREE_PREFERENCES,
      codeFontFamily: 'default',
      codeFontSize: 13,
      codeFontLigatures: true,
    })

    expect(document.getElementById(CODE_FONT_STYLE_ID)).toBeNull()
  })
})
