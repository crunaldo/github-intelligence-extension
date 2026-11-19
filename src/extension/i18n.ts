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

    // Banners & Token Requirement
    rate_limit_alert_title: 'Token de GitHub requerido:',
    rate_limit_alert_desc: 'Agrega tu Token personal de GitHub para habilitar el análisis profundo de carpetas y dependencias.',
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
    token_benefit_title: 'Requisito indispensable de funcionamiento',
    token_benefit_desc: 'Tu GitHub Personal Access Token (solo lectura) se guarda 100% de forma local en tu navegador y es un requisito indispensable para inspeccionar la estructura de carpetas, árboles de dependencias, manifiestos y habilitar las funciones Pro.',
    instructions_title: 'Instructivo rápido (Paso a paso en 1 minuto):',
    instruction_1: 'Haz clic en el botón superior "Crear Token en GitHub".',
    instruction_2: 'Inicia sesión en GitHub si te lo solicita. La página se abrirá con el nombre y permisos recomendados ya configurados.',
    instruction_3: 'Verifica que la casilla "public_repo" esté marcada (solo requiere permisos de lectura a repos públicos).',
    instruction_4: 'Baja al final de la página en GitHub y presiona el botón verde "Generate token".',
    instruction_5: 'Copia el código generado (inicia con ghp_...) y pégalo en la casilla de abajo.',
    instruction_6: 'Haz clic en "Guardar" o "Verificar". ¡Tu token quedará guardado localmente y el análisis profundo quedará habilitado de inmediato!',
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

    // Code Tree Lateral Dock Settings
    code_tree_settings_title: 'Árbol de Código Lateral (Dock en GitHub)',
    code_tree_settings_desc: 'Configura la barra lateral desplegable y explorador de archivos embebido en GitHub.',
    code_tree_enabled: 'Habilitar explorador de código en GitHub',
    code_tree_enabled_desc: 'Muestra la pestaña lateral y el explorador de archivos embebido en las páginas de GitHub.',
    code_tree_status_active: 'Habilitado',
    code_tree_status_disabled: 'Desactivado',
    code_tree_hover_to_open: 'Abrir al pasar el cursor (Hover to open)',
    code_tree_hover_to_open_desc: 'Despliega el panel del árbol automáticamente al posar el puntero sobre la pestaña lateral.',
    code_tree_open_folders_click: 'Abrir carpetas con un solo clic (Open folders on click)',
    code_tree_open_folders_click_desc: 'Expande o contrae carpetas inmediatamente al hacer clic en su fila.',
    code_tree_pin_per_window: 'Mantener siempre visible (Pin per window)',
    code_tree_pin_per_window_desc: 'Mantiene el explorador abierto mientras haces clic en archivos y navegas por el repositorio sin cerrarse.',
    code_tree_position: 'Ubicación de la pestaña en pantalla',
    code_tree_position_left: 'Izquierda',
    code_tree_position_right: 'Derecha',
    code_tree_vertical_pos: 'Posición vertical (% de altura)',
    code_tree_hide_urls: 'Ocultar cuando la URL coincida con (Hide when URL matches)',
    code_tree_hide_urls_desc: 'Palabras clave o patrones separados por comas donde no mostrar la pestaña (ej. issues, pulls, actions, settings).',
    code_tree_hide_urls_placeholder: 'ej. issues, pulls, releases, actions',
    code_tree_shortcut: 'Atajo de teclado (Shortcut)',
    code_tree_shortcut_desc: 'Combinación de teclas para abrir/cerrar el árbol lateral.',
    code_tree_shortcut_placeholder: 'ej. Alt+W',
    code_tree_font_family: 'Fuente de código (Code font)',
    code_tree_font_family_desc: 'Personaliza la tipografía en todos los visores de código de GitHub.',
    code_tree_font_size: 'Tamaño de fuente de código',
    code_tree_font_ligatures: 'Habilitar ligaduras de programación (Ligatures: =>, !=, ===)',
    code_tree_font_ligatures_desc: 'Transforma operadores y símbolos en glifos continuos elegantes.',
    code_tree_icon_theme: 'Tema de iconos de archivos (Icon theme)',
    code_tree_icon_theme_desc: 'Elige el estilo visual de los iconos para más de 40 lenguajes.',
    code_tree_icon_theme_vscode: 'VS Code Material (Colorido y moderno)',
    code_tree_icon_theme_seti: 'Seti UI (Clásico oscuro)',
    code_tree_icon_theme_github: 'GitHub Native (Sutil y minimalista)',
    code_tree_enterprise_domains: 'Dominios de GitHub Enterprise',
    code_tree_enterprise_domains_desc: 'Lista de hostnames separados por comas para instancias corporativas privadas (ej. github.mycompany.com).',
    code_tree_enterprise_placeholder: 'ej. github.internal.corp, git.company.com',
    token_profiles_title: 'Perfiles de Token (Multi-Account PAT)',
    token_profiles_desc: 'Administra múltiples tokens personales de acceso (Personal, Trabajo, Consultoría).',
    token_profiles_add: 'Agregar Token',
    token_profiles_active: 'Perfil activo',
    token_profiles_label_placeholder: 'Etiqueta (ej. Trabajo / Personal)',
    token_profiles_token_placeholder: 'ghp_...',
    token_profiles_delete: 'Eliminar',

    // Pro Plan & Auth
    pro_plan_title: 'Plan Pro & Autenticación',
    pro_plan_desc: 'Conecta tu cuenta de GitHub para desbloquear diagramas de arquitectura, auditoría profunda y hasta 250 consultas diarias con IA.',
    pro_sign_in_github: 'Conectar con GitHub',
    pro_upgrade_btn: 'Mejorar a Pro ($4.99)',
    pro_sign_out: 'Cerrar sesión',
    pro_connected_as: 'Conectado como',
    pro_badge_active: 'PRO ACTIVO',
    pro_badge_free: 'PLAN FREE',
    quota_exceeded_title: 'Límite diario gratuito alcanzado',
    quota_exceeded_desc: 'Has utilizado tus análisis gratuitos de hoy. Pásate a Pro para obtener análisis ilimitados de arquitectura, auditoría profunda y mascota IA.',
    upgrade_to_pro_btn: 'Mejorar a Pro ($4.99)',
    ai_error_notice: 'No se pudo cargar el resumen inteligente en este momento.',
    retry_btn: 'Reintentar',
    maintenance_title: 'Modo mantenimiento',
    pro_arch_locked_title: 'Diagrama de Arquitectura & Auditoría Pro',
    pro_arch_locked_desc: 'Desbloquea diagramas Mermaid generados por IA y auditoría técnica profunda de fortalezas y riesgos con el Plan Pro.',
    pro_diagrams_disabled_notice: 'Los diagramas de arquitectura están temporalmente deshabilitados por el administrador.',
    auth_cancelled_notice: 'El inicio de sesión con GitHub fue cancelado o no se completó.',
    upgrade_cancelled_notice: 'Completa el inicio de sesión con GitHub para abrir el checkout Pro.',

    // Architecture diagram & Pro redesign
    arch_mode_native: 'Nativo',
    arch_mode_ai: 'IA',
    arch_native_subtitle: 'Generado directamente por la extensión analizando el código y dependencias.',
    arch_ai_subtitle: 'Generado por modelo de IA con análisis semántico.',
    arch_title_native: 'Diagrama de Arquitectura (Nativo)',
    arch_title_ai: 'Diagrama de Arquitectura (IA)',
    pro_features_title: 'Beneficios del Plan Pro',
    pro_feat_tree: 'Árbol de Código Avanzado',
    pro_feat_tree_desc: 'Búsqueda instantánea, navegación multi-rama y temas.',
    pro_feat_audit: 'Auditoría Técnica Profunda',
    pro_feat_audit_desc: 'Análisis de fortalezas, riesgos y arquitectura.',
    pro_feat_mascot: 'Mascota Asistente Octo',
    pro_feat_mascot_desc: 'Chat interactivo ilimitado con contexto del repo.',
    pro_feat_tokens: 'Multi-Token & Enterprise',
    pro_feat_tokens_desc: 'Perfiles de PAT y soporte para dominios corporativos.',
    pro_refresh_status: 'Actualizar estado',
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

    // Banners & Token Requirement
    rate_limit_alert_title: 'GitHub Token required:',
    rate_limit_alert_desc: 'Add your personal GitHub Token to enable deep folder structure and dependency inspection.',
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
    token_benefit_title: 'Essential operational requirement',
    token_benefit_desc: 'Your read-only GitHub Personal Access Token is stored 100% locally in your browser and is an essential operational requirement to inspect repository file trees, dependency manifests, and unlock Pro features.',
    instructions_title: 'Quick 1-minute step-by-step guide:',
    instruction_1: 'Click the button above "Create Token on GitHub".',
    instruction_2: 'Sign in to GitHub if requested. The form is pre-filled with recommended settings.',
    instruction_3: 'Verify that "public_repo" scope is checked (read-only access to public repos).',
    instruction_4: 'Scroll to the bottom of the GitHub page and click the green "Generate token" button.',
    instruction_5: 'Copy the generated token (starts with ghp_...) and paste it in the box below.',
    instruction_6: 'Click "Save" or "Verify". Your token is saved locally and deep repository analysis is enabled immediately!',
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

    // Code Tree Lateral Dock Settings
    code_tree_settings_title: 'Side Code Tree (GitHub In-Page Dock)',
    code_tree_settings_desc: 'Configure the sliding file tree explorer embedded directly inside GitHub repository pages.',
    code_tree_enabled: 'Enable in-page code tree dock on GitHub',
    code_tree_enabled_desc: 'Show the sliding drawer and directory explorer directly inside GitHub pages.',
    code_tree_status_active: 'Enabled',
    code_tree_status_disabled: 'Disabled',
    code_tree_hover_to_open: 'Hover to open',
    code_tree_hover_to_open_desc: 'Automatically expand the code tree drawer when hovering over the lateral toggle tab.',
    code_tree_open_folders_click: 'Open folders on click',
    code_tree_open_folders_click_desc: 'Expand or collapse directories immediately upon clicking their row.',
    code_tree_pin_per_window: 'Pin per window (Stay open as active explorer)',
    code_tree_pin_per_window_desc: 'Keep the dock persistently open while clicking files and exploring code without auto-collapsing.',
    code_tree_position: 'Tab screen position',
    code_tree_position_left: 'Left',
    code_tree_position_right: 'Right',
    code_tree_vertical_pos: 'Vertical position (% of screen height)',
    code_tree_hide_urls: 'Hide when URL matches',
    code_tree_hide_urls_desc: 'Comma-separated keywords or URL paths where the dock tab should be hidden (e.g. issues, pulls, actions).',
    code_tree_hide_urls_placeholder: 'e.g. issues, pulls, releases, actions',
    code_tree_shortcut: 'Keyboard shortcut',
    code_tree_shortcut_desc: 'Key combination to toggle the code tree drawer open or closed.',
    code_tree_shortcut_placeholder: 'e.g. Alt+W',
    code_tree_font_family: 'Code font family',
    code_tree_font_family_desc: 'Customize typography across all GitHub native code viewers.',
    code_tree_font_size: 'Code font size',
    code_tree_font_ligatures: 'Enable programming ligatures (=>, !=, ===)',
    code_tree_font_ligatures_desc: 'Renders operators and symbols as elegant continuous ligatures.',
    code_tree_icon_theme: 'File icon theme',
    code_tree_icon_theme_desc: 'Choose the visual icon theme for 40+ programming languages.',
    code_tree_icon_theme_vscode: 'VS Code Material (Vibrant & modern)',
    code_tree_icon_theme_seti: 'Seti UI (Classic dark)',
    code_tree_icon_theme_github: 'GitHub Native (Subtle & minimal)',
    code_tree_enterprise_domains: 'GitHub Enterprise domains',
    code_tree_enterprise_domains_desc: 'Comma-separated hostnames for private corporate instances (e.g. github.mycompany.com).',
    code_tree_enterprise_placeholder: 'e.g. github.internal.corp, git.company.com',
    token_profiles_title: 'Token Profiles (Multi-Account PAT)',
    token_profiles_desc: 'Manage multiple personal access tokens (Personal, Work, Client).',
    token_profiles_add: 'Add Token',
    token_profiles_active: 'Active Profile',
    token_profiles_label_placeholder: 'Label (e.g. Work / Personal)',
    token_profiles_token_placeholder: 'ghp_...',
    token_profiles_delete: 'Remove',

    // Pro Plan & Auth
    pro_plan_title: 'Pro Plan & Authentication',
    pro_plan_desc: 'Connect your GitHub account to unlock interactive architecture diagrams, deep audits, and up to 250 daily AI queries.',
    pro_sign_in_github: 'Sign in with GitHub',
    pro_upgrade_btn: 'Upgrade to Pro ($4.99)',
    pro_sign_out: 'Sign out',
    pro_connected_as: 'Signed in as',
    pro_badge_active: 'PRO ACTIVE',
    pro_badge_free: 'FREE PLAN',
    quota_exceeded_title: 'Daily free limit reached',
    quota_exceeded_desc: 'You have reached today’s free AI analysis limit. Upgrade to Pro for architecture diagrams, deep audits, and the interactive AI mascot.',
    upgrade_to_pro_btn: 'Upgrade to Pro ($4.99)',
    ai_error_notice: 'Could not load AI intelligence right now.',
    retry_btn: 'Retry',
    maintenance_title: 'Maintenance Mode',
    pro_arch_locked_title: 'Pro Architecture Diagram & Deep Audit',
    pro_arch_locked_desc: 'Unlock AI-generated Mermaid architecture diagrams and deep technical strengths & concerns audits with Pro.',
    pro_diagrams_disabled_notice: 'Architecture diagrams are temporarily disabled by the administrator.',
    auth_cancelled_notice: 'GitHub sign-in was cancelled or did not complete.',
    upgrade_cancelled_notice: 'Complete GitHub sign-in to proceed to Pro checkout.',

    // Architecture diagram & Pro redesign
    arch_mode_native: 'Native',
    arch_mode_ai: 'AI',
    arch_native_subtitle: 'Generated directly by the extension analyzing code and dependencies.',
    arch_ai_subtitle: 'Generated by AI model with semantic analysis.',
    arch_title_native: 'Architecture Diagram (Native)',
    arch_title_ai: 'Architecture Diagram (AI)',
    pro_features_title: 'Pro Plan Features',
    pro_feat_tree: 'Advanced Code Tree',
    pro_feat_tree_desc: 'Instant search, multi-branch & icon themes.',
    pro_feat_audit: 'Deep Technical Audit',
    pro_feat_audit_desc: 'Analysis of strengths, risks, and design patterns.',
    pro_feat_mascot: 'Octo Assistant Mascot',
    pro_feat_mascot_desc: 'Unlimited chat with repository knowledge.',
    pro_feat_tokens: 'Multi-Token & Enterprise',
    pro_feat_tokens_desc: 'PAT profiles and enterprise domain support.',
    pro_refresh_status: 'Refresh status',
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
