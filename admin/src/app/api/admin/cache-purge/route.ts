import { handleAdminCachePurgeRequest } from '../../../../lib/admin-api'

export async function POST(request: Request): Promise<Response> {
  return handleAdminCachePurgeRequest(request)
}
