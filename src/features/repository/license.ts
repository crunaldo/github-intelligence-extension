// License & Commercial Use Analysis Engine
import type { GitHubLicense } from './types'
import type { ActiveLocale } from '../../extension/i18n'

export type CommercialVerdictType = 'permissive' | 'copyleft' | 'network_copyleft' | 'restricted' | 'unlicensed'

export type LicenseAnalysis = {
  name: string
  spdxId: string
  verdictType: CommercialVerdictType
  verdictBadge: string
  verdictBadgeColor: string
  title: string
  canUseCommercially: boolean
  canUseClosedSource: boolean
  requiresDiscloseSource: boolean
  explanation: string
  permissions: string[]
  conditions: string[]
  limitations: string[]
}

export function analyzeRepositoryLicense(
  license: GitHubLicense | null | undefined,
  locale: ActiveLocale = 'es'
): LicenseAnalysis {
  const isEs = locale === 'es'
  const spdx = (license?.spdxId || license?.name || '').toUpperCase().trim()

  // 1. Permissive (MIT, Apache, BSD, ISC, Unlicense, CC0)
  if (
    spdx.includes('MIT') ||
    spdx.includes('APACHE') ||
    spdx.includes('BSD') ||
    spdx.includes('ISC') ||
    spdx.includes('UNLICENSE') ||
    spdx.includes('CC0')
  ) {
    const isApache = spdx.includes('APACHE')
    return {
      name: license?.name || spdx || 'MIT License',
      spdxId: license?.spdxId || 'MIT',
      verdictType: 'permissive',
      verdictBadge: isEs ? 'Comercial 100% Permitido' : '100% Commercial Friendly',
      verdictBadgeColor: '#10b981',
      title: isEs
        ? 'Licencia Permisiva (Apta para Empresas y Código Cerrado)'
        : 'Permissive License (Safe for Commercial & Proprietary)',
      canUseCommercially: true,
      canUseClosedSource: true,
      requiresDiscloseSource: false,
      explanation: isEs
        ? `Puedes usar este código en proyectos comerciales, clientes y productos cerrados sin obligación de publicar tu código fuente. Solo debes conservar el aviso de copyright y la licencia original.`
        : `You can freely use this code in commercial projects and proprietary closed-source apps without sharing your own source code. You only need to retain the original copyright notice.`,
      permissions: isEs
        ? ['Uso comercial ilimitado', 'Modificación de código', 'Distribución privada y pública', 'Inclusión en apps cerradas']
        : ['Commercial use', 'Code modification', 'Private & public distribution', 'Proprietary packaging'],
      conditions: isEs
        ? ['Incluir el aviso de copyright y licencia original en la documentación o código']
        : ['Include original copyright and license notice'],
      limitations: isEs
        ? ['Sin garantía de ningún tipo', 'Los autores no asumen responsabilidad legal', ...(isApache ? ['No concede derecho de usar marcas registradas'] : [])]
        : ['No warranty provided', 'Authors not liable for damages', ...(isApache ? ['No trademark use granted'] : [])],
    }
  }

  // 2. Strong Copyleft (GPL-2.0, GPL-3.0)
  if (spdx.includes('GPL') && !spdx.includes('AGPL') && !spdx.includes('LGPL')) {
    return {
      name: license?.name || spdx,
      spdxId: license?.spdxId || 'GPL-3.0',
      verdictType: 'copyleft',
      verdictBadge: isEs ? 'Copyleft (Código Abierto)' : 'Copyleft (Open Source Only)',
      verdictBadgeColor: '#f59e0b',
      title: isEs
        ? 'Licencia Copyleft Recíproca (GPL)'
        : 'Reciprocal Copyleft License (GPL)',
      canUseCommercially: true,
      canUseClosedSource: false,
      requiresDiscloseSource: true,
      explanation: isEs
        ? `Puedes usar este software comercialmente, PERO si modificas o integras este código en un producto que distribuyas, estás obligado legalmente a publicar TODO el código fuente de tu producto bajo la misma licencia GPL.`
        : `You can use it commercially, BUT if you distribute software incorporating this code, you are legally required to open-source your entire product under the same GPL license.`,
      permissions: isEs
        ? ['Uso comercial permitido', 'Modificación y adaptación', 'Distribución bajo la misma licencia']
        : ['Commercial use allowed', 'Modification permitted', 'Distribution under same license'],
      conditions: isEs
        ? ['Obligación de liberar todo el código fuente (Copyleft)', 'Divulgar y documentar cambios realizados', 'Conservar licencias y avisos originales']
        : ['Must disclose source code of derived work', 'Document code changes', 'Retain copyright & license notices'],
      limitations: isEs
        ? ['No permite crear productos de código cerrado', 'Sin garantías', 'Sin responsabilidad legal de los autores']
        : ['Cannot be embedded into closed-source apps', 'No warranty provided', 'No liability'],
    }
  }

  // 3. Network Copyleft (AGPL)
  if (spdx.includes('AGPL')) {
    return {
      name: license?.name || spdx,
      spdxId: license?.spdxId || 'AGPL-3.0',
      verdictType: 'network_copyleft',
      verdictBadge: isEs ? 'Copyleft de Red (AGPL)' : 'Network Copyleft (AGPL)',
      verdictBadgeColor: '#f43f5e',
      title: isEs
        ? 'Licencia AGPL (Estricta para Servicios en la Nube / SaaS)'
        : 'AGPL License (Strict for Cloud / SaaS)',
      canUseCommercially: true,
      canUseClosedSource: false,
      requiresDiscloseSource: true,
      explanation: isEs
        ? `Atención especial para SaaS/Cloud: Si ejecutas este código en un servidor accesible por red, debes poner todo el código fuente del servicio a disposición de los usuarios que interactúen con él por internet.`
        : `Strict cloud warning: If you run this on a server and users interact with it over a network (SaaS), you are legally required to make the entire source code available to them.`,
      permissions: isEs
        ? ['Uso comercial permitido', 'Modificación de código']
        : ['Commercial use', 'Modification'],
      conditions: isEs
        ? ['Liberar código fuente a los usuarios de red (SaaS/Cloud)', 'Publicar cambios bajo AGPL']
        : ['Must provide source code over network (SaaS)', 'Release changes under AGPL'],
      limitations: isEs
        ? ['Incompatible con SaaS propietario cerrado', 'Sin garantías', 'Sin responsabilidad']
        : ['Incompatible with closed-source SaaS', 'No warranty', 'No liability'],
    }
  }

  // 4. Weak Copyleft (LGPL, MPL, EPL)
  if (spdx.includes('LGPL') || spdx.includes('MPL') || spdx.includes('EPL')) {
    return {
      name: license?.name || spdx,
      spdxId: license?.spdxId || 'LGPL-3.0',
      verdictType: 'copyleft',
      verdictBadge: isEs ? 'Copyleft Débil (Librería)' : 'Weak Copyleft (Library)',
      verdictBadgeColor: '#818cf8',
      title: isEs
        ? 'Licencia Copyleft Débil / Nivel Librería'
        : 'Weak Copyleft / Library-Level License',
      canUseCommercially: true,
      canUseClosedSource: true,
      requiresDiscloseSource: false,
      explanation: isEs
        ? `Puedes usar esta librería en aplicaciones comerciales cerradas si la enlazas dinámicamente. Sin embargo, si modificas los archivos internos de esta librería, esas modificaciones sí deben ser publicadas como código abierto.`
        : `You can link to this library in proprietary commercial applications. However, if you modify the files of this library itself, those modifications must remain open source.`,
      permissions: isEs
        ? ['Uso comercial permitido', 'Enlace en aplicaciones cerradas', 'Modificación de código']
        : ['Commercial use allowed', 'Linkable in closed-source apps', 'Modification'],
      conditions: isEs
        ? ['Publicar modificaciones hechas a la librería', 'Conservar avisos de copyright']
        : ['Publish changes made to library files', 'Retain copyright notices'],
      limitations: isEs
        ? ['Sin garantías', 'Sin responsabilidad']
        : ['No warranty', 'No liability'],
    }
  }

  // 5. Restrictive / Source-Available / Non-Commercial (BSL, SSPL, CC-NC)
  if (spdx.includes('BSL') || spdx.includes('SSPL') || spdx.includes('NC') || spdx.includes('COMMONS CLAUSE')) {
    return {
      name: license?.name || spdx,
      spdxId: license?.spdxId || 'BSL-1.1',
      verdictType: 'restricted',
      verdictBadge: isEs ? 'Uso Comercial Restringido' : 'Restricted Commercial',
      verdictBadgeColor: '#f43f5e',
      title: isEs
        ? 'Licencia con Restricción Comercial / Source-Available'
        : 'Source-Available / Restrictive License',
      canUseCommercially: false,
      canUseClosedSource: false,
      requiresDiscloseSource: false,
      explanation: isEs
        ? `Esta licencia NO es código abierto tradicional. Prohíbe o restringe el uso comercial (por ejemplo, ofrecerlo como servicio competidor en la nube o usarlo en producción sin pagar una licencia comercial al autor).`
        : `This is NOT traditional open source. It forbids or restricts commercial production usage (e.g., competing managed cloud services) without purchasing a commercial license from the author.`,
      permissions: isEs
        ? ['Lectura de código', 'Uso no comercial o pruebas internas']
        : ['Read source code', 'Non-commercial or testing use'],
      conditions: isEs
        ? ['Consultar términos de la empresa creadora para producción comercial']
        : ['Consult vendor terms for commercial production'],
      limitations: isEs
        ? ['Prohibido monetizar directamente como servicio', 'No apto para competencia directa']
        : ['Cannot monetize directly as service', 'Not open for competing services'],
    }
  }

  // 6. Sin licencia explícita / Todos los derechos reservados
  return {
    name: license?.name || (isEs ? 'Sin Licencia Declarada' : 'No License Declared'),
    spdxId: 'NONE',
    verdictType: 'unlicensed',
    verdictBadge: isEs ? 'Sin Licencia (Precaución)' : 'No License (Caution)',
    verdictBadgeColor: '#f43f5e',
    title: isEs
      ? 'Sin Licencia Abierta Detectada (Todos los Derechos Reservados)'
      : 'No Open Source License (All Rights Reserved)',
    canUseCommercially: false,
    canUseClosedSource: false,
    requiresDiscloseSource: false,
    explanation: isEs
      ? `Por derecho internacional de autor, si un repositorio de GitHub no incluye un archivo de licencia explícito, el autor retiene todos los derechos. No tienes permiso legal para copiar, modificar o usar este código comercialmente sin autorización directa del propietario.`
      : `Under international copyright law, if a repository lacks an explicit open-source license, the author retains all rights. You do not have legal permission to use, modify, or distribute this code commercially without direct written permission.`,
    permissions: isEs
      ? ['Visualizar el código en GitHub']
      : ['View code on GitHub only'],
    conditions: isEs
      ? ['Contactar al autor para solicitar autorización o licencia comercial']
      : ['Contact author for permission or custom commercial license'],
    limitations: isEs
      ? ['Sin derechos de uso comercial', 'Sin derechos de modificación o redistribución']
      : ['No commercial use rights', 'No redistribution or derivative rights'],
  }
}
