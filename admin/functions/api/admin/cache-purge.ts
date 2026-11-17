import { type AdminServerEnv, handleAdminCachePurgeRequest } from '../../../src/lib/admin-api'

export interface PagesFunctionContext<Env = AdminServerEnv> {
  request: Request
  env: Env
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  return handleAdminCachePurgeRequest(context.request, context.env)
}
