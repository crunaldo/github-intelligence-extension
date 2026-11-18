import {
  type AdminServerEnv,
  handleAdminCachePurgeRequest,
  handleAdminKvSyncRequest
} from './lib/admin-api'

interface PagesEnv extends AdminServerEnv {
  ASSETS?: {
    fetch(request: Request | string): Promise<Response>
  }
}

const DEFAULT_SUPABASE_URL = 'https://ovgvjlcalzynnekclwhy.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable__SbNMjzjd1D1Nw1J2-DM9Q_0AO3xFxd'

export default {
  async fetch(request: Request, env: PagesEnv): Promise<Response> {
    const url = new URL(request.url)
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'

    const resolvedEnv: AdminServerEnv = {
      ...env,
      SUPABASE_URL: env.SUPABASE_URL || env.supabaseUrl || DEFAULT_SUPABASE_URL,
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY
    }

    if (normalizedPath === '/api/admin/kv-sync') {
      return handleAdminKvSyncRequest(request, resolvedEnv)
    }

    if (normalizedPath === '/api/admin/cache-purge') {
      return handleAdminCachePurgeRequest(request, resolvedEnv)
    }

    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request)
      if (assetRes.status === 404 && request.method === 'GET' && !normalizedPath.startsWith('/api/')) {
        const indexUrl = new URL('/index.html', request.url)
        return env.ASSETS.fetch(new Request(indexUrl.toString(), request))
      }
      return assetRes
    }

    return new Response('Not Found', { status: 404 })
  }
}
