export interface SupabaseQueryResult {
  error?: { message?: string } | null
}

export interface SupabaseSelectQueryResult<T = Record<string, unknown>> {
  data?: T[] | null
  error?: { message?: string } | null
}

export interface SupabaseTableClient {
  upsert(
    values: Record<string, unknown>,
    options?: { onConflict?: string }
  ): Promise<SupabaseQueryResult> | SupabaseTableClient
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<SupabaseQueryResult>
  }
  select?(columns: string): {
    eq(column: string, value: string): Promise<SupabaseSelectQueryResult>
  }
}

export interface SupabaseClientLike {
  from(table: string): SupabaseTableClient
}

export interface LemonSqueezyWebhookEvent {
  meta?: {
    event_name?: string
    custom_data?: {
      user_id?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  data?: {
    id?: string | number
    attributes?: {
      status?: string
      customer_id?: string | number
      variant_id?: string | number
      renews_at?: string | null
      ends_at?: string | null
      current_period_end?: string | null
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

const SUPPORTED_SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_resumed',
  'subscription_cancelled',
  'subscription_expired'
])

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'on_trial'])

function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < maxLength; i++) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0
    const codeB = i < b.length ? b.charCodeAt(i) : 0
    diff |= codeA ^ codeB
  }
  return diff === 0
}

async function computeHmacSha256Hex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function resolveSubscriptionState(
  eventName: string,
  rawStatus: string
): { status: string; isPro: boolean } {
  if (eventName === 'subscription_expired' || eventName === 'subscription_cancelled') {
    const fallbackStatus = eventName === 'subscription_expired' ? 'expired' : 'cancelled'
    return {
      status: rawStatus || fallbackStatus,
      isPro: false
    }
  }

  const normalizedStatus = rawStatus || 'active'
  return {
    status: normalizedStatus,
    isPro: ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)
  }
}

/**
 * Verifies a Lemon Squeezy HMAC-SHA256 webhook signature in constant time and
 * idempotently syncs subscription and Pro status changes to Supabase.
 */
export async function handleLemonSqueezyWebhook(
  payload: LemonSqueezyWebhookEvent | string,
  signature: string,
  secret: string,
  supabase: SupabaseClientLike,
  rawBody?: string
): Promise<{ handled: boolean; status: string }> {
  const normalizedSignature = (signature ?? '').trim().toLowerCase()
  if (!normalizedSignature || !secret) {
    throw new Error('INVALID_WEBHOOK_SIGNATURE')
  }

  const bodyToVerify =
    rawBody ?? (typeof payload === 'string' ? payload : JSON.stringify(payload))
  const expectedSignature = await computeHmacSha256Hex(bodyToVerify, secret)

  if (!constantTimeEqual(normalizedSignature, expectedSignature)) {
    throw new Error('INVALID_WEBHOOK_SIGNATURE')
  }

  const event: LemonSqueezyWebhookEvent =
    typeof payload === 'string'
      ? (JSON.parse(payload) as LemonSqueezyWebhookEvent)
      : payload

  const eventName = event?.meta?.event_name ?? ''
  const attributes = event?.data?.attributes ?? {}
  const rawStatus = typeof attributes.status === 'string' ? attributes.status : ''

  if (!SUPPORTED_SUBSCRIPTION_EVENTS.has(eventName)) {
    return { handled: false, status: rawStatus || 'ignored' }
  }

  const { status, isPro } = resolveSubscriptionState(eventName, rawStatus)
  const userId = event?.meta?.custom_data?.user_id
  const lemonSubId = event?.data?.id != null ? String(event.data.id) : null
  const customerId = attributes.customer_id != null ? String(attributes.customer_id) : null
  const variantId = attributes.variant_id != null ? String(attributes.variant_id) : null
  const currentPeriodEnd =
    attributes.renews_at ?? attributes.ends_at ?? attributes.current_period_end ?? null

  if (lemonSubId) {
    const subscriptionRow: Record<string, unknown> = {
      lemon_subscription_id: lemonSubId,
      status,
      variant_id: variantId,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString()
    }
    if (userId) {
      subscriptionRow.user_id = String(userId)
    }

    const upsertRes = await supabase
      .from('subscriptions')
      .upsert(subscriptionRow, { onConflict: 'lemon_subscription_id' })
    if (upsertRes && 'error' in upsertRes && upsertRes.error) {
      throw new Error(`SUBSCRIPTION_UPSERT_FAILED: ${upsertRes.error.message ?? 'unknown error'}`)
    }
  }

  let targetUserId: string | null = userId ? String(userId) : null
  if (!targetUserId && lemonSubId) {
    const subscriptionsTable = supabase.from('subscriptions')
    if (typeof subscriptionsTable.select === 'function') {
      const lookupRes = await subscriptionsTable
        .select('user_id')
        .eq('lemon_subscription_id', lemonSubId)
      if (lookupRes && 'error' in lookupRes && lookupRes.error) {
        throw new Error(`SUBSCRIPTION_LOOKUP_FAILED: ${lookupRes.error.message ?? 'unknown error'}`)
      }
      const existingUserId = lookupRes?.data?.[0]?.user_id
      if (typeof existingUserId === 'string' && existingUserId.length > 0) {
        targetUserId = existingUserId
      }
    }
  }

  if (targetUserId) {
    const profilePatch: Record<string, unknown> = { is_pro: isPro }
    if (customerId !== null) {
      profilePatch.lemon_customer_id = customerId
    }
    const updateRes = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', targetUserId)

    if (updateRes && 'error' in updateRes && updateRes.error) {
      throw new Error(`PROFILE_UPDATE_FAILED: ${updateRes.error.message ?? 'unknown error'}`)
    }
  }

  return { handled: true, status }
}
