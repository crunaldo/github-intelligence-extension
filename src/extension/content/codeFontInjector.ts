import type { CodeTreePreferences } from '../storage'

export const CODE_FONT_STYLE_ID = 'gpi-code-font-style'

const FONT_MAP: Record<CodeTreePreferences['codeFontFamily'], { name: string; importUrl?: string }> = {
  jetbrains: {
    name: "'JetBrains Mono', monospace",
    importUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap',
  },
  fira: {
    name: "'Fira Code', monospace",
    importUrl: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap',
  },
  cascadia: {
    name: "'Cascadia Code', monospace",
    importUrl: 'https://fonts.googleapis.com/css2?family=Cascadia+Code:wght@400;500;600&display=swap',
  },
  'source-code': {
    name: "'Source Code Pro', monospace",
    importUrl: 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600&display=swap',
  },
  default: {
    name: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
}

const TARGET_SELECTORS = [
  '.blob-code',
  '.blob-code-inner',
  '.react-code-text',
  '.react-code-lines',
  'table.highlight td',
  'table.highlight td span',
  'pre.blob-code',
  'pre code',
  '.diff-table td',
  '.diff-table .blob-code-inner',
  '.cm-content',
  '.cm-line',
].join(',\n')

export function removeCodeFontSettings(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(CODE_FONT_STYLE_ID)
  if (existing) {
    existing.remove()
  }
}

export function applyCodeFontSettings(prefs: CodeTreePreferences): void {
  if (typeof document === 'undefined') return

  const isDefaultFamily = !prefs.codeFontFamily || prefs.codeFontFamily === 'default'
  const isDefaultSize = !prefs.codeFontSize || prefs.codeFontSize === 13
  const isDefaultLigatures = prefs.codeFontLigatures !== false

  if (isDefaultFamily && isDefaultSize && isDefaultLigatures) {
    removeCodeFontSettings()
    return
  }

  const fontInfo = FONT_MAP[prefs.codeFontFamily] || FONT_MAP.default
  const importRule = fontInfo.importUrl ? `@import url('${fontInfo.importUrl}');\n` : ''
  const fontFamilyRule = !isDefaultFamily ? `font-family: ${fontInfo.name} !important;` : ''
  const fontSizeRule = prefs.codeFontSize ? `font-size: ${prefs.codeFontSize}px !important;` : ''
  const ligaturesRule = prefs.codeFontLigatures
    ? 'font-variant-ligatures: normal !important; font-feature-settings: "liga" 1, "calt" 1 !important;'
    : 'font-variant-ligatures: none !important; font-feature-settings: "liga" 0, "calt" 0 !important;'

  const css = `
${importRule}
${TARGET_SELECTORS} {
  ${fontFamilyRule}
  ${fontSizeRule}
  ${ligaturesRule}
}
`.trim()

  let styleEl = document.getElementById(CODE_FONT_STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = CODE_FONT_STYLE_ID
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}
