// Internationalization (i18n) Engine for GitHub Project Intelligence Assistant
// Supports Automatic System/Browser Language Detection, English and Spanish

export type AppLanguage = 'auto' | 'es' | 'en'
export type ActiveLocale = 'es' | 'en'

export function detectSystemLanguage(): ActiveLocale {
  try {
    // 1. Chrome extension UI language
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      const uiLang = chrome.i18n.getUILanguage().toLowerCase()
      if (uiLang.startsWith('es')) return 'es'
      if (uiLang.startsWith('en')) return 'en'
    }

    // 2. Navigator languages array
    if (typeof navigator !== 'undefined') {
      const navLangs = navigator.languages || [navigator.language]
      for (const lang of navLangs) {
        if (!lang) continue
        const code = lang.toLowerCase()
        if (code.startsWith('es')) return 'es'
        if (code.startsWith('en')) return 'en'
      }
    }

    // 3. Intl resolved locale
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase()
      if (intlLocale?.startsWith('es')) return 'es'
      if (intlLocale?.startsWith('en')) return 'en'

      // Check timezone for Spanish-speaking regions
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      const hispanicTimezones = [
        'Europe/Madrid', 'America/Bogota', 'America/Mexico_City', 'America/Buenos_Aires',
        'America/Santiago', 'America/Lima', 'America/Caracas', 'America/Montevideo',
        'America/Guayaquil', 'America/La_Paz', 'America/Asuncion', 'America/Guatemala',
        'America/Havana', 'America/Santo_Domingo', 'America/Tegucigalpa', 'America/San_Jose',
        'America/Panama', 'America/El_Salvador', 'America/Managua'
      ]
      if (hispanicTimezones.some((htz) => tz.includes(htz) || tz.endsWith(htz))) {
        return 'es'
      }
    }
  } catch {
    // Fallback
  }

  // Chrome Web Store international default: English
  return 'en'
}

export function resolveActiveLanguage(preference: AppLanguage): ActiveLocale {
  if (preference === 'es') return 'es'
  if (preference === 'en') return 'en'
  return detectSystemLanguage()
}

export const TRANSLATIONS: Record<ActiveLocale, Record<string, string>> = {
  es: {
    // Header & Actions
    app_title: 'GitHub Intelligence',
    panel_title: 'Panel Lateral',
    open_sidepanel: 'Panel',
    open_sidepanel_full: 'Panel Lateral',
    search_another: 'Buscar otro repositorio',
    toggle_theme: 'Alternar tema claro/oscuro',
    settings: 'Ajustes',
    analyzing_repo: 'Analizando repositorio...',
    analyzing_desc: 'Consultando árbol de código, dependencias, manifiestos y arquitectura.',

    // Banners & Rate Limit
    rate_limit_alert_title: 'Límite de 60 peticiones/h:',
    rate_limit_alert_desc: 'Agrega tu Token de GitHub para obtener 5,000 peticiones/h y evitar bloqueos.',
    rate_limit_alert_btn: 'Ajustes',
    detected_in_tab: 'Detectado en pestaña actual:',
    reload_analysis: 'Recargar análisis',
    search_placeholder: 'Analizar repo: ej. facebook/react o URL completa...',
    analyze_btn: 'Analizar',

    // Empty States
    not_in_github: 'No estás en un repositorio de GitHub',
    not_in_github_desc: 'Abre cualquier pestaña de GitHub o selecciona uno de los repositorios destacados a continuación para obtener su resumen instantáneo:',
    no_repo_selected: 'Ningún repositorio seleccionado',
    no_repo_selected_desc: 'Introduce una URL o navega en GitHub en cualquier pestaña para ver el análisis automático en tiempo real.',
    no_reports_yet: 'Sin reportes guardados',
    no_reports_yet_desc: 'Los repositorios que analices se archivarán aquí automáticamente para consulta offline.',
    no_favs_yet: 'Sin favoritos aún',
    no_favs_yet_desc: 'Marca repositorios con la estrella para acceder rápidamente a ellos.',

    // Hero & Metrics
    stars: 'Estrellas',
    forks: 'Forks',
    issues: 'Issues',
    size: 'Tamaño',
    default_branch: 'Rama principal',
    open_in_github: 'Abrir repositorio en GitHub',

    // Explanation Section
    repo_explanation: 'Explicación del Repo',
    what_is_it: '¿DE QUÉ SE TRATA?',
    why_it_matters: '¿POR QUÉ TE IMPORTA?',
    in_practice: 'EN LA PRÁCTICA',
    ideal_for: 'Ideal para:',

    // Secondary Tabs / Nav
    tab_pc_compat: 'Compatibilidad PC',
    tab_install: 'Instalación',
    tab_details: 'Detalles Técnicos',
    tab_summary: 'Resumen',
    tab_architecture: 'Arquitectura',
    tab_dependencies: 'Dependencias',
    tab_files: 'Archivos',
    tab_releases: 'Releases',
    tab_sources: 'Fuentes & API',

    // Hardware Card
    hw_analyzing: 'Analizando hardware y sistema operativo de tu PC...',
    hw_processor: 'PROCESADOR',
    hw_cores: 'Núcleos',
    hw_ram: 'MEMORIA RAM',
    hw_total: 'Totales',
    hw_free: 'Libres',
    hw_in_use: 'uso',
    hw_disk: 'ESPACIO EN DISCO',
    hw_in_disk: 'en',
    hw_os: 'SISTEMA OPERATIVO',
    hw_os_compatible: 'Entorno Compatible',
    hw_os_warning: 'Atención SO',
    hw_recommendation: 'Recomendación para este repositorio:',
    hw_perfect: '100% Compatible con tu PC',
    hw_perfect_badge: 'Corre Perfecto',

    // Roadmap View
    roadmap_title: 'Roadmap de Instalación en 4 Pasos',
    roadmap_quick_pill: 'Guía Rápida',
    copy: 'Copiar',
    copied: 'Copiado',
    agents_launch_title: 'Ejecutar con un Agente de IA:',
    agents_launch_sub: 'Abre la app con prompt listo',
    agents_launch_desc: 'Copia el prompt completo de instalación con el contexto de tu PC y abre directamente la app de escritorio de tu agente preferido:',
    agent_toast: '¡Prompt copiado al portapapeles! Abriendo {agent}. Presiona Ctrl+V para enviar.',

    // Floating Button & Footer
    view_full_analysis: 'Ver análisis completo',
    save_favorite: 'Guardar',
    saved_favorite: 'Favorito',
    copy_markdown: 'Markdown',
    copied_markdown: 'Copiado',

    // Settings View
    settings_title: 'Configuración de Token & API',
    github_token_title: 'GitHub Personal Access Token (API)',
    btn_create_token: 'Crear Token en GitHub',
    token_benefit_title: '¿Por qué agregar un token?',
    token_benefit_desc: 'Sin token, GitHub limita a solo 60 peticiones/hora por dirección IP. Con un token gratuito de lectura obtienes 5,000 peticiones/hora, permitiendo análisis instantáneos, inspección profunda de carpetas y navegación continua sin bloqueos.',
    instructions_title: 'Instructivo rápido (Paso a paso en 1 minuto):',
    instruction_1: 'Haz clic en el botón superior "Crear Token en GitHub".',
    instruction_2: 'Inicia sesión en GitHub si te lo solicita. La página se abrirá con el nombre y permisos recomendados ya configurados.',
    instruction_3: 'Verifica que la casilla "public_repo" esté marcada (solo requiere permisos de lectura a repos públicos).',
    instruction_4: 'Baja al final de la página en GitHub y presiona el botón verde "Generate token".',
    instruction_5: 'Copia el código generado (inicia con ghp_...) y pégalo en la casilla de abajo.',
    instruction_6: 'Haz clic en "Guardar" o "Verificar". ¡Tu límite subirá de inmediato a 5,000 peticiones/hora!',
    paste_token_placeholder: 'Pega tu token aquí: ghp_xxxxxxxxxxxxxxxxxxxx',
    btn_save: 'Guardar',
    btn_saved: 'Guardado',
    btn_verify: 'Verificar',
    auto_sync_title: 'Sincronización automática de pestañas',
    auto_sync_desc: 'Al navegar por repositorios en GitHub, detectar y actualizar automáticamente el análisis.',
    language_title: 'Idioma de la interfaz / Language',
    language_auto: 'Automático (Detectar)',
    language_es: 'Español (Spanish)',
    language_en: 'English (Inglés)',
    theme_title: 'Tema visual',
    theme_dark: 'Oscuro',
    theme_light: 'Claro',
    theme_system: 'Sistema',
    storage_title: 'Almacenamiento y Caché',
    storage_desc: 'Elimina los reportes guardados en memoria y restablece el historial.',
    btn_clean: 'Limpiar',
    btn_cleaned: 'Limpiado',
  },

  en: {
    // Header & Actions
    app_title: 'GitHub Intelligence',
    panel_title: 'Side Panel',
    open_sidepanel: 'Panel',
    open_sidepanel_full: 'Side Panel',
    search_another: 'Search another repository',
    toggle_theme: 'Toggle light/dark theme',
    settings: 'Settings',
    analyzing_repo: 'Analyzing repository...',
    analyzing_desc: 'Querying code tree, dependencies, manifests, and architecture.',

    // Banners & Rate Limit
    rate_limit_alert_title: '60 req/h rate limit:',
    rate_limit_alert_desc: 'Add your GitHub Token to unlock 5,000 req/h and avoid API rate limits.',
    rate_limit_alert_btn: 'Settings',
    detected_in_tab: 'Detected in active tab:',
    reload_analysis: 'Reload analysis',
    search_placeholder: 'Analyze repo: e.g. facebook/react or full URL...',
    analyze_btn: 'Analyze',

    // Empty States
    not_in_github: 'You are not on a GitHub repository',
    not_in_github_desc: 'Open any GitHub tab or choose one of the featured repositories below to get an instant intelligence report:',
    no_repo_selected: 'No repository selected',
    no_repo_selected_desc: 'Enter a URL or browse GitHub in any tab to view real-time automated intelligence.',
    no_reports_yet: 'No saved reports',
    no_reports_yet_desc: 'Repositories you analyze will be automatically cached here for offline consultation.',
    no_favs_yet: 'No favorites yet',
    no_favs_yet_desc: 'Star repositories to access them quickly from here.',

    // Hero & Metrics
    stars: 'Stars',
    forks: 'Forks',
    issues: 'Issues',
    size: 'Size',
    default_branch: 'Default branch',
    open_in_github: 'Open repository on GitHub',

    // Explanation Section
    repo_explanation: 'Repository Explanation',
    what_is_it: 'WHAT IS THIS ABOUT?',
    why_it_matters: 'WHY SHOULD YOU CARE?',
    in_practice: 'IN PRACTICE',
    ideal_for: 'Ideal for:',

    // Secondary Tabs / Nav
    tab_pc_compat: 'PC Compatibility',
    tab_install: 'Installation',
    tab_details: 'Technical Details',
    tab_summary: 'Summary',
    tab_architecture: 'Architecture',
    tab_dependencies: 'Dependencies',
    tab_files: 'Files',
    tab_releases: 'Releases',
    tab_sources: 'Sources & API',

    // Hardware Card
    hw_analyzing: 'Analyzing your PC hardware and operating system...',
    hw_processor: 'PROCESSOR',
    hw_cores: 'Cores',
    hw_ram: 'RAM MEMORY',
    hw_total: 'Total',
    hw_free: 'Free',
    hw_in_use: 'used',
    hw_disk: 'DISK SPACE',
    hw_in_disk: 'in',
    hw_os: 'OPERATING SYSTEM',
    hw_os_compatible: 'Compatible Environment',
    hw_os_warning: 'OS Warning',
    hw_recommendation: 'Recommendation for this repository:',
    hw_perfect: '100% Compatible with your PC',
    hw_perfect_badge: 'Runs Smoothly',

    // Roadmap View
    roadmap_title: '4-Step Installation Roadmap',
    roadmap_quick_pill: 'Quick Guide',
    copy: 'Copy',
    copied: 'Copied',
    agents_launch_title: 'Execute with an AI Agent:',
    agents_launch_sub: 'Opens app with prompt ready',
    agents_launch_desc: 'Copies the complete installation prompt with your PC specs and opens your favorite desktop AI agent app directly:',
    agent_toast: 'Installation prompt copied to clipboard! Opening {agent}. Press Ctrl+V to run.',

    // Floating Button & Footer
    view_full_analysis: 'View full analysis',
    save_favorite: 'Save',
    saved_favorite: 'Saved',
    copy_markdown: 'Markdown',
    copied_markdown: 'Copied',

    // Settings View
    settings_title: 'Token & API Settings',
    github_token_title: 'GitHub Personal Access Token (API)',
    btn_create_token: 'Create Token on GitHub',
    token_benefit_title: 'Why add a personal token?',
    token_benefit_desc: 'Without a token, GitHub limits your IP to 60 requests/hour. A free read-only personal token gives you 5,000 requests/hour, enabling instant multi-folder analysis and uninterrupted browsing.',
    instructions_title: 'Quick 1-minute step-by-step guide:',
    instruction_1: 'Click the button above "Create Token on GitHub".',
    instruction_2: 'Sign in to GitHub if requested. The form is pre-filled with recommended settings.',
    instruction_3: 'Verify that "public_repo" scope is checked (read-only access to public repos).',
    instruction_4: 'Scroll to the bottom of the GitHub page and click the green "Generate token" button.',
    instruction_5: 'Copy the generated token (starts with ghp_...) and paste it in the box below.',
    instruction_6: 'Click "Save" or "Verify". Your limit increases immediately to 5,000 requests/hour!',
    paste_token_placeholder: 'Paste your token here: ghp_xxxxxxxxxxxxxxxxxxxx',
    btn_save: 'Save',
    btn_saved: 'Saved',
    btn_verify: 'Verify',
    auto_sync_title: 'Automatic tab synchronization',
    auto_sync_desc: 'When browsing repositories on GitHub, automatically detect and update analysis.',
    language_title: 'Interface Language / Idioma',
    language_auto: 'Automatic (Detect system)',
    language_es: 'Español (Spanish)',
    language_en: 'English',
    theme_title: 'Visual Theme',
    theme_dark: 'Dark',
    theme_light: 'Light',
    theme_system: 'System',
    storage_title: 'Storage & Cache',
    storage_desc: 'Clear cached repository reports and reset analysis history.',
    btn_clean: 'Clear',
    btn_cleaned: 'Cleared',
  },
}

export function t(key: string, locale: ActiveLocale = 'es', params?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[locale] || TRANSLATIONS.es
  let text = dict[key] || TRANSLATIONS.es[key] || key

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }

  return text
}
