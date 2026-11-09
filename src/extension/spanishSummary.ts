import type { RepositoryReport } from '../features/repository/types'
import type { ActiveLocale } from './i18n'

export type ColloquialExplanation = {
  headline: string
  whatItIs: string
  whyItMatters: string
  practicalUse: string
  targetAudience: string
  stackPills: string[]
  shortDescription: string
}

const NOTABLE_PROJECTS_ES: Record<
  string,
  { whatItIs: string; whyItMatters: string; practicalUse: string; targetAudience: string; headline: string }
> = {
  'facebook/react': {
    headline: '🎨 El estándar global para construir interfaces interactivas',
    whatItIs:
      'Es la librería más usada en el mundo para crear pantallas web interactivas mediante componentes reutilizables. En lugar de manipular HTML manualmente, React sincroniza automáticamente lo que ves en pantalla cuando tus datos cambian.',
    whyItMatters:
      'Tiene el ecosistema más grande del planeta. Cualquier duda que tengas ya está respondida en internet, y la inmensa mayoría de las empresas solicitan React para vacantes de frontend.',
    practicalUse:
      'Úsalo para crear aplicaciones web completas, paneles administrativos, SaaS o portales dinámicos.',
    targetAudience: 'Desarrolladores Frontend y Fullstack',
  },
  'vitejs/vite': {
    headline: '⚡ Servidor de desarrollo y empaquetador ultrarrápido',
    whatItIs:
      'Es la herramienta moderna que reemplazó a Webpack. Hace que tu código cargue al instante en el navegador usando módulos ES nativos y compila en segundos gracias a Rollup y esbuild.',
    whyItMatters:
      'Elimina las esperas frustrantes: guarda un archivo y verás los cambios en milisegundos en pantalla sin recargar la página entera.',
    practicalUse:
      'La base ideal para empezar cualquier proyecto con React, Vue, Svelte o TypeScript puro sin configurar nada complejo.',
    targetAudience: 'Desarrolladores Frontend y Diseñadores Web',
  },
  'tauri-apps/tauri': {
    headline: '🖥️ Apps de escritorio ligeras con web + Rust',
    whatItIs:
      'Una alternativa a Electron pero infinitamente más ligera y segura. Te permite usar tu frontend web favorito (HTML, CSS, JS/TS) mientras que el motor nativo del sistema operativo está impulsado por Rust.',
    whyItMatters:
      'Una app de Electron suele pesar más de 120 MB y consumir mucha RAM. Con Tauri, el ejecutable puede pesar menos de 10 MB y usar un mínimo de memoria.',
    practicalUse:
      'Crea aplicaciones de escritorio nativas para Windows, macOS y Linux con distribución lista para tiendas.',
    targetAudience: 'Creadores de software, desarrolladores desktop y amantes de Rust',
  },
  'astral-sh/uv': {
    headline: '🐍 Gestor de paquetes de Python 10x a 100x más rápido',
    whatItIs:
      'Una herramienta todo-en-uno escrita en Rust que sustituye a pip, pip-tools, virtualenv y poetry con una velocidad asombrosa jamás vista en el ecosistema de Python.',
    whyItMatters:
      'Instalar paquetes pesados como PyTorch o Pandas pasa de minutos a un par de segundos. Resuelve dependencias de forma determinista y sin dolores de cabeza.',
    practicalUse:
      'Úsalo en tus proyectos de ciencia de datos, backend con FastAPI o scripts diarios para no volver a esperar a pip.',
    targetAudience: 'Desarrolladores Python, Data Scientists e Ingenieros de Machine Learning',
  },
  'vercel/next.js': {
    headline: '🚀 El framework empresarial fullstack para React',
    whatItIs:
      'Es el framework que complementa a React con renderizado en el servidor (SSR), generación estática (SSG), optimización automática de imágenes y rutas de API backend integradas.',
    whyItMatters:
      'Brinda el mejor posicionamiento SEO, tiempos de carga récord y viene con arquitectura de producción lista sin configurar servidores manuales.',
    practicalUse:
      'Ideal para e-commerce, sitios de noticias, blogs y aplicaciones web de gran escala donde el SEO y la velocidad son críticos.',
    targetAudience: 'Desarrolladores Fullstack y Frontend avanzados',
  },
}

const NOTABLE_PROJECTS_EN: Record<
  string,
  { whatItIs: string; whyItMatters: string; practicalUse: string; targetAudience: string; headline: string }
> = {
  'facebook/react': {
    headline: '🎨 The global standard for interactive user interfaces',
    whatItIs:
      'The most widely adopted library in the world for creating dynamic user interfaces using reusable components. Instead of manual DOM manipulation, React synchronizes what you see as your application state changes.',
    whyItMatters:
      'Unrivaled community ecosystem and battle-tested at world scale. Nearly any question is already answered online, and it remains the top demanded frontend skill globally.',
    practicalUse:
      'Build rich web applications, SaaS dashboards, interactive portals, and cross-platform native apps.',
    targetAudience: 'Frontend & Fullstack Developers',
  },
  'vitejs/vite': {
    headline: '⚡ Next generation ultra-fast frontend tooling',
    whatItIs:
      'The modern build tool and dev server that superseded legacy bundlers. It leverages native ES modules in the browser for instant server start and lightning fast Hot Module Replacement (HMR).',
    whyItMatters:
      'Eliminates agonizing build waits: save a file and see changes reflected in milliseconds without reloading the entire page.',
    practicalUse:
      'The recommended foundation to kick off any React, Vue, Svelte, or TypeScript project with zero config friction.',
    targetAudience: 'Frontend Developers & Web Engineers',
  },
  'tauri-apps/tauri': {
    headline: '🖥️ Build tiny, blazing-fast desktop apps with Web + Rust',
    whatItIs:
      'A lean, secure alternative to Electron. It lets you write your user interface with your preferred web stack (HTML, CSS, JS/TS) while delegating native OS systems to high-performance Rust.',
    whyItMatters:
      'Electron bundles can exceed 120 MB and eat significant RAM. Tauri binaries are often under 10 MB with minimal memory footprint and hardened security.',
    practicalUse:
      'Distribute native cross-platform desktop applications for Windows, macOS, and Linux with official app store readiness.',
    targetAudience: 'Desktop App Creators, Rust Enthusiasts, and Web Engineers',
  },
  'astral-sh/uv': {
    headline: '🐍 Extremely fast Python package & project manager',
    whatItIs:
      'An all-in-one Python tooling suite written in Rust designed as a drop-in 10x-100x faster replacement for pip, pip-tools, virtualenv, and poetry.',
    whyItMatters:
      'Heavy package installations (like PyTorch or Pandas) drop from minutes to sub-second speeds with deterministic lockfiles.',
    practicalUse:
      'Use it across your data science pipelines, FastAPI microservices, or daily scripts to never wait on pip again.',
    targetAudience: 'Python Developers, Data Scientists, and ML Engineers',
  },
  'vercel/next.js': {
    headline: '🚀 The production-grade React framework for the web',
    whatItIs:
      'The leading fullstack framework for React, combining Server-Side Rendering (SSR), Static Site Generation (SSG), automatic image optimization, and built-in API routes.',
    whyItMatters:
      'Delivers top-tier SEO performance, instant page loads, and enterprise-ready routing without having to configure custom Node.js servers.',
    practicalUse:
      'Ideal for e-commerce, content platforms, SaaS apps, and scalable web services where speed and discoverability are paramount.',
    targetAudience: 'Fullstack & Senior Frontend Engineers',
  },
}

export function generateColloquialSpanishSummary(
  report: RepositoryReport,
  locale: ActiveLocale = 'es'
): ColloquialExplanation {
  const repoKey = (report.repository?.fullName || '').toLowerCase()
  const notableMap = locale === 'en' ? NOTABLE_PROJECTS_EN : NOTABLE_PROJECTS_ES

  if (notableMap[repoKey]) {
    const preset = notableMap[repoKey]
    const stackPills = [
      report.languages?.[0]?.name || (locale === 'en' ? 'Code' : 'Código'),
      report.repository?.license?.spdxId || report.repository?.license?.name || 'Open Source',
      report.manifests?.[0]?.ecosystem || (locale === 'en' ? 'Native' : 'Nativo'),
    ].filter(Boolean)

    return {
      headline: preset.headline,
      whatItIs: preset.whatItIs,
      whyItMatters: preset.whyItMatters,
      practicalUse: preset.practicalUse,
      targetAudience: preset.targetAudience,
      stackPills,
      shortDescription: preset.whatItIs.split('.')[0] + '.',
    }
  }

  const name = report.repository?.name || 'Repository'
  const desc = report.repository?.description || ''
  const topics = (report.repository?.topics || []).map((t) => (t || '').toLowerCase())
  const langs = (report.languages || []).map((l) => l?.name || '')
  const primaryLang = langs[0] || (locale === 'en' ? 'Software' : 'Código')
  const stars = report.repository?.stars || 0

  // Semantic category inference
  const isUi =
    topics.some((t) => ['react', 'vue', 'svelte', 'ui', 'frontend', 'components', 'css', 'tailwind', 'html'].includes(t)) ||
    /ui|frontend|component|css|design-system/i.test(desc)
  const isCli =
    topics.some((t) => ['cli', 'terminal', 'shell', 'command-line', 'console'].includes(t)) ||
    /\bcli\b|terminal|command[- ]line/i.test(desc)
  const isAi =
    topics.some((t) => ['ai', 'llm', 'machine-learning', 'deep-learning', 'openai', 'agent', 'rag', 'pytorch', 'transformers', 'gpt'].includes(t)) ||
    /\bai\b|llm|machine[- ]learning|artificial intelligence|neural/i.test(desc)
  const isDesktop =
    topics.some((t) => ['desktop', 'tauri', 'electron', 'gui', 'windows', 'macos'].includes(t)) ||
    /desktop|electron|tauri/i.test(desc)
  const isBackend =
    topics.some((t) => ['backend', 'api', 'server', 'microservice', 'rest', 'graphql', 'http'].includes(t)) ||
    /backend|api|server|microservice|http/i.test(desc)
  const isDatabase =
    topics.some((t) => ['database', 'sql', 'nosql', 'orm', 'storage', 'cache', 'redis', 'postgres'].includes(t)) ||
    /database|orm|sql|redis|postgres|storage/i.test(desc)

  if (locale === 'en') {
    let headline = `What is ${name}?`
    if (isAi) headline = `🤖 Artificial Intelligence & Agent Suite in ${primaryLang}`
    else if (isCli) headline = `⚡ Command-Line Tool (CLI) in ${primaryLang}`
    else if (isDesktop) headline = `🖥️ Native Desktop Application in ${primaryLang}`
    else if (isUi) headline = `🎨 Modern Web UI & Component Library in ${primaryLang}`
    else if (isBackend) headline = `🚀 Backend & API Infrastructure in ${primaryLang}`
    else if (isDatabase) headline = `💾 Data Management & Storage in ${primaryLang}`

    let whatItIs = desc
    if (!whatItIs || whatItIs.length < 15) {
      if (isAi) whatItIs = `An artificial intelligence framework developed in ${primaryLang}, designed to integrate large language models, autonomous agents, or cognitive pipelines.`
      else if (isCli) whatItIs = `A terminal and command-line utility built in ${primaryLang} to automate workflows and execute recurring developer tasks quickly.`
      else if (isDesktop) whatItIs = `A native desktop application built with ${primaryLang}, offering a standalone GUI interface ready for your operating system.`
      else if (isUi) whatItIs = `A modular user interface and component suite in ${primaryLang} designed to build interactive, responsive web screens without boilerplate.`
      else if (isBackend) whatItIs = `A robust backend server engine in ${primaryLang} designed for handling HTTP requests, databases, and microservices.`
      else whatItIs = `An open-source software project built primarily in ${primaryLang}, providing clean abstractions and modular tools.`
    }

    let whyItMatters = ''
    if (stars > 25000) whyItMatters = `A massive industry standard with over ${stars.toLocaleString()} GitHub stars. Battle-tested across thousands of production environments.`
    else if (stars > 3000) whyItMatters = `Healthy community with ${stars.toLocaleString()} GitHub stars and steady maintenance. Saves weeks of development effort.`
    else whyItMatters = `Solves this specific problem out-of-the-box, saving you from reinventing the wheel.`

    let practicalUse = ''
    if (isUi) practicalUse = 'Use it to assemble polished dashboards, component systems, or web applications with consistent styling.'
    else if (isCli) practicalUse = 'Use it to run automated tasks straight from your terminal (PowerShell, bash, zsh).'
    else if (isAi) practicalUse = 'Use it to build chatbots, connect LLMs to external tools, or experiment with machine learning models.'
    else practicalUse = `Incorporate it into your ${primaryLang} projects to speed up development.`

    let targetAudience = 'Software Developers & Engineers'
    if (isUi) targetAudience = 'Frontend Developers & Web Designers'
    else if (isCli) targetAudience = 'Terminal Devs, DevOps & System Admins'
    else if (isAi) targetAudience = 'AI Engineers, Data Scientists & Innovators'
    else if (isBackend) targetAudience = 'Backend & Fullstack Engineers'

    const stackPills = [
      primaryLang,
      report.repository?.license?.spdxId || report.repository?.license?.name || 'Open Source',
      report.manifests?.[0]?.ecosystem || 'Native Ecosystem',
    ].filter(Boolean)

    return {
      headline,
      whatItIs,
      whyItMatters,
      practicalUse,
      targetAudience,
      stackPills,
      shortDescription: whatItIs.split('.')[0] + '.',
    }
  }

  // Spanish (default)
  let headline = `¿De qué va ${name}?`
  if (isAi) headline = `🤖 Inteligencia Artificial & Agentes en ${primaryLang}`
  else if (isCli) headline = `⚡ Herramienta de Terminal (CLI) en ${primaryLang}`
  else if (isDesktop) headline = `🖥️ Aplicación de Escritorio en ${primaryLang}`
  else if (isUi) headline = `🎨 Interfaz y Componentes Web en ${primaryLang}`
  else if (isBackend) headline = `🚀 Servicios Backend & API en ${primaryLang}`
  else if (isDatabase) headline = `💾 Gestión de Datos & Base de Datos en ${primaryLang}`

  let whatItIs = desc
  if (!whatItIs || whatItIs.length < 15) {
    if (isAi) whatItIs = `Plataforma y conjunto de herramientas de Inteligencia Artificial desarrollado en ${primaryLang}. Permite automatizar flujos cognitivos, conectar modelos de lenguaje o integrar agentes autónomos con facilidad.`
    else if (isCli) whatItIs = `Utilidad directa para la consola o terminal (CLI) construida en ${primaryLang}. Está diseñada para automatizar comandos recurrentes, gestionar flujos de trabajo y ahorrar tiempo frente a interfaces lentas.`
    else if (isDesktop) whatItIs = `Aplicación de escritorio nativa desarrollada en ${primaryLang}. Cuenta con una interfaz gráfica lista para instalar y usar en tu sistema operativo, sin depender exclusivamente del navegador.`
    else if (isUi) whatItIs = `Librería visual y catálogo de componentes en ${primaryLang}. Facilita el desarrollo de interfaces web atractivas, accesibles y modulares, evitando tener que programar estilos y animaciones desde cero.`
    else if (isBackend) whatItIs = `Motor de backend y servicios API en ${primaryLang}. Provee la infraestructura central para despachar solicitudes HTTP, procesar datos de negocio y conectar con servicios externos.`
    else whatItIs = `Proyecto de código abierto desarrollado principalmente en ${primaryLang}. Ofrece una solución estructurada y modular orientada a resolver tareas especializadas de software.`
  }

  let whyItMatters = ''
  if (stars > 25000) whyItMatters = `Es un estándar masivo de la industria (${stars.toLocaleString()} estrellas). No inventes la rueda: su código está hiperprobado en producción por miles de empresas globales.`
  else if (stars > 3000) whyItMatters = `Cuenta con una comunidad madura (${stars.toLocaleString()} estrellas) y mantenimiento constante. Te ahorra días enteros de codificación al darte una base sólida y probada.`
  else whyItMatters = `Te permite resolver este problema concreto sin escribir todo desde cero, aprovechando la arquitectura y abstracciones ya diseñadas por su autor.`

  let practicalUse = ''
  if (isUi) practicalUse = 'Úsalo para ensamblar interfaces limpias, paneles de administración, aplicaciones web interactivas o design systems sin enredos de estilos.'
  else if (isCli) practicalUse = 'Úsalo para correr flujos directamente en tu terminal (PowerShell, bash o zsh), automatizar scripts de despliegue o tareas repetitivas.'
  else if (isAi) practicalUse = 'Úsalo para crear chatbots, agentes autónomos, procesamiento de lenguaje natural o conectar modelos LLM con tus propios datos.'
  else practicalUse = `Úsalo en tus proyectos cuando trabajes con ${primaryLang} para acelerar tu desarrollo y apoyarte en soluciones ya testeadas.`

  let targetAudience = 'Desarrolladores y creadores de software'
  if (isUi) targetAudience = 'Frontend Developers, Diseñadores Web y Creadores de UI'
  else if (isCli) targetAudience = 'Desarrolladores de Terminal, SysAdmins y DevOps'
  else if (isAi) targetAudience = 'Ingenieros de IA, Data Scientists e Innovadores'
  else if (isBackend) targetAudience = 'Desarrolladores Backend, Fullstack y Arquitectos'

  const stackPills = [
    primaryLang,
    report.repository?.license?.spdxId || report.repository?.license?.name || 'Open Source',
    report.manifests?.[0]?.ecosystem || 'Ecosistema nativo',
  ].filter(Boolean)

  return {
    headline,
    whatItIs,
    whyItMatters,
    practicalUse,
    targetAudience,
    stackPills,
    shortDescription: whatItIs.split('.')[0] + '.',
  }
}
