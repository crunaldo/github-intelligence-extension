# Monetización, Backend Edge y Panel de Control - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la infraestructura de monetización y el backend Edge para GitHub Intelligence Extension, implementando una arquitectura thin-client con $0 USD de costo base fijo, pasarela Lemon Squeezy, router de IA multi-proveedor con fallback automático, control anti-abuso, cuotas unificadas y un panel administrativo integral.

**Architecture:** La extensión delega toda la inteligencia a un Cloudflare Worker en el Edge perimetral. El Worker gestiona rate-limiting y cuotas en Cloudflare KV, ejecuta un caché global (`owner/repo:commit_sha`), orquesta la cadena de LLMs (Gemini $\rightarrow$ Groq $\rightarrow$ Cloudflare AI $\rightarrow$ OpenRouter) y persiste usuarios, suscripciones y analíticas en Supabase PostgreSQL. Un panel web en Cloudflare Pages permite la administración remota de prompts, *feature flags*, cuotas y métricas sin requerir nuevas versiones en la Chrome Web Store.

**Tech Stack:** Cloudflare Workers, TypeScript, Cloudflare KV, Supabase (PostgreSQL, Auth, RLS), Lemon Squeezy (Webhooks / MoR), React 19 / WXT (Extension), Vitest.

**Spec:** [2026-11-12-monetization-architecture-design.md](file:///c:/Users/moder/Documents/ChatGPT/github-intelligence-extension/docs/superpowers/specs/2026-11-12-monetization-architecture-design.md)

## Global Constraints

* Base fixed operational cost must be exactly **$0.00 USD/month** across Cloudflare, Supabase and Pages free tiers.
* Free anonymous users are capped at **15 queries/day** by IP + client fingerprint hash.
* Pro users ($4.99/mo) are capped at **250 unified interactions/day** (analyses + mascot chat messages).
* In the Pro tier, the user's GitHub Personal Access Token (PAT) must be requested transparently as a simple operational requirement and stored **strictly on client** in `chrome.storage.local` (never transmitted to backend DB).
* Never expose AI provider keys or database service role secrets in the extension client bundle.
* All public repo context ingestion is served via `raw.githubusercontent.com` CDN to prevent exhausting GitHub unauthenticated API rate limits.
* All prompts, classification logic and diagrams generation reside on the backend (thin-client model).

## Review Focus

1. **GitHub CDN 404 / Private Repo attempted in V1:** When a user visits a private or non-existent repo URL where `raw.githubusercontent.com` returns 404, the Worker must cleanly return a structured `REPOSITORY_NOT_ACCESSIBLE` error rather than crashing or throwing unhandled LLM exceptions.
2. **Provider Cascade Failure (All LLMs rate-limited or down):** If Gemini, Groq, Cloudflare AI and OpenRouter all fail simultaneously, the gateway must return a graceful degraded 503 response with a retry recommendation, without corrupting the KV cache.
3. **Lemon Squeezy Webhook Replay / Duplicate delivery:** Webhooks may be redelivered; webhook handler must be idempotent on `lemon_subscription_id` and timestamp verification.
4. **Free Tier Cache Poisoning & Signature Forgery:** An attacker forging headers must not be able to bypass the 15/day limit; IP extraction relies on trusted Cloudflare header `CF-Connecting-IP`.
5. **Role-Based Response Leakage:** When serving a cached complete analysis (which contains Pro architecture diagrams), the edge filter must strictly strip `architectureDiagram` and `deepAudit` if the caller does not supply a valid active Pro JWT.

---

### Task 1: Edge AI Gateway & Multi-Provider Fallback Router

**Files:**
- Create: `backend/src/ai/types.ts`
- Create: `backend/src/ai/router.ts`
- Create: `backend/src/ai/providers/gemini.ts`
- Create: `backend/src/ai/providers/groq.ts`
- Create: `backend/src/ai/providers/cloudflare-ai.ts`
- Create: `backend/src/ai/providers/openrouter.ts`
- Test: `backend/tests/ai-router.test.ts`

**Interfaces:**
- Produces: `generateRepoAnalysis(context: RepoContext, config: AIConfig): Promise<AnalysisResult>`
- Types:
  ```typescript
  export interface RepoContext {
    owner: string
    repo: string
    commitSha: string
    readme: string
    manifests: Record<string, string>
  }
  export interface AnalysisResult {
    summary: {
      headline: string
      whatItIs: string
      whyItMatters: string
      practicalUse: string
      targetAudience: string
      stackPills: string[]
    }
    architectureDiagram: string // Mermaid syntax
    deepAudit: {
      strengths: string[]
      concerns: string[]
    }
    providerUsed: string
    tokensConsumed: number
  }
  ```

- [ ] **Step 1: Write failing test for multi-provider fallback**

```typescript
// backend/tests/ai-router.test.ts
import { describe, it, expect, vi } from 'vitest'
import { generateRepoAnalysis } from '../src/ai/router'

describe('AI Multi-Provider Fallback Router', () => {
  it('falls back to Groq when Gemini returns 429 rate limit', async () => {
    const mockContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      commitSha: 'abc1234',
      readme: '# Test Repo\nA test library.',
      manifests: { 'package.json': '{"name":"test"}' }
    }
    const mockProviders = {
      gemini: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
      groq: vi.fn().mockResolvedValue({
        summary: {
          headline: 'A test project',
          whatItIs: 'Test library',
          whyItMatters: 'Helpful for testing',
          practicalUse: 'Unit tests',
          targetAudience: 'Developers',
          stackPills: ['TypeScript']
        },
        architectureDiagram: 'graph TD; A-->B;',
        deepAudit: { strengths: ['Fast'], concerns: [] },
        providerUsed: 'groq',
        tokensConsumed: 120
      }),
      cfAi: vi.fn(),
      openRouter: vi.fn()
    }
    const result = await generateRepoAnalysis(mockContext, { providers: mockProviders })
    expect(mockProviders.gemini).toHaveBeenCalledOnce()
    expect(mockProviders.groq).toHaveBeenCalledOnce()
    expect(result.providerUsed).toBe('groq')
    expect(result.summary.whatItIs).toBe('Test library')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run backend/tests/ai-router.test.ts`  
Expected: FAIL with "Cannot find module '../src/ai/router'"

- [ ] **Step 3: Implement providers and fallback router in `backend/src/ai/`**

Create `backend/src/ai/types.ts`, individual provider wrappers for Gemini 2.0 Flash, Groq Llama 3.3, Cloudflare AI, and OpenRouter, and orchestrator `generateRepoAnalysis` with structured JSON parsing and cascade fallback.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/ai-router.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai backend/tests/ai-router.test.ts
git commit -m "feat(backend): implement multi-provider AI fallback router"
```

---

### Task 2: Edge Rate Limiting, Anti-Abuse & Hierarchical Caching

**Files:**
- Create: `backend/src/middleware/rate-limiter.ts`
- Create: `backend/src/cache/repo-cache.ts`
- Create: `backend/src/middleware/role-filter.ts`
- Test: `backend/tests/rate-limiter.test.ts`
- Test: `backend/tests/repo-cache.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult` from Task 1.
- Produces: 
  - `checkAndIncrementQuota(identifier: string, isPro: boolean, kv: KVNamespace): Promise<{ allowed: boolean; remaining: number }>`
  - `getCachedAnalysis(owner: string, repo: string, commitSha: string, kv: KVNamespace): Promise<AnalysisResult | null>`
  - `setCachedAnalysis(owner: string, repo: string, commitSha: string, data: AnalysisResult, kv: KVNamespace): Promise<void>`
  - `filterResponseForRole(data: AnalysisResult, isPro: boolean): FilteredAnalysisResult`

- [ ] **Step 1: Write failing tests for quota and role filtering**

```typescript
// backend/tests/rate-limiter.test.ts
import { describe, it, expect, vi } from 'vitest'
import { checkAndIncrementQuota } from '../src/middleware/rate-limiter'
import { filterResponseForRole } from '../src/middleware/role-filter'

describe('Rate Limiter & Role Filter', () => {
  it('blocks anonymous user after 15 requests', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue('15'),
      put: vi.fn()
    } as any
    const res = await checkAndIncrementQuota('anon-hash-1', false, mockKv)
    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
  })

  it('strips architecture diagrams and deep audit for Free users', () => {
    const fullAnalysis = {
      summary: { headline: 'Repo', whatItIs: 'desc', whyItMatters: '', practicalUse: '', targetAudience: '', stackPills: [] },
      architectureDiagram: 'graph TD; A-->B;',
      deepAudit: { strengths: ['Good'], concerns: [] },
      providerUsed: 'gemini',
      tokensConsumed: 100
    }
    const filtered = filterResponseForRole(fullAnalysis, false)
    expect(filtered.summary).toBeDefined()
    expect((filtered as any).architectureDiagram).toBeUndefined()
    expect((filtered as any).deepAudit).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run backend/tests/rate-limiter.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement rate limiter, cache and role filter**

Implement `checkAndIncrementQuota` with key `quota:YYYY-MM-DD:<id>`, `getCachedAnalysis` with 30-day TTL in KV, and `filterResponseForRole` stripping Pro keys for unauthenticated/free requests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/rate-limiter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware backend/src/cache backend/tests/
git commit -m "feat(backend): implement KV rate limiting and role-based response filter"
```

---

### Task 3: Supabase Schema, Webhook Handler & Worker Entrypoint

**Files:**
- Create: `backend/supabase/migrations/20261112000000_init_monetization.sql`
- Create: `backend/src/webhooks/lemonsqueezy.ts`
- Create: `backend/src/worker.ts`
- Test: `backend/tests/webhook.test.ts`

**Interfaces:**
- Produces:
  - `handleLemonSqueezyWebhook(payload: any, signature: string, secret: string, supabase: any): Promise<{ handled: boolean; status: string }>`
  - Worker endpoints: `POST /v1/analyze`, `POST /v1/mascot/chat`, `POST /v1/webhooks/lemonsqueezy`, `GET /v1/config`

- [ ] **Step 1: Write failing test for Lemon Squeezy webhook signature verification and Pro upgrade**

```typescript
// backend/tests/webhook.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleLemonSqueezyWebhook } from '../src/webhooks/lemonsqueezy'

describe('Lemon Squeezy Webhook Handler', () => {
  it('activates Pro status on subscription_created event', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null })
    }
    const event = {
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'user-uuid-123' } },
      data: {
        id: 'sub_123',
        attributes: { status: 'active', customer_id: 'cust_abc', variant_id: 'var_456' }
      }
    }
    const result = await handleLemonSqueezyWebhook(event, 'valid-signature', 'secret', mockSupabase)
    expect(result.handled).toBe(true)
    expect(result.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run backend/tests/webhook.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement SQL migration, HMAC webhook validation, and main Worker router**

Add `20261112000000_init_monetization.sql`, implement webhook handler with crypto HMAC verification, and create `backend/src/worker.ts` wiring up `/v1/analyze` (ingesting `raw.githubusercontent.com`), rate limiter, cache, and router.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/webhook.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/supabase backend/src/webhooks backend/src/worker.ts backend/tests/webhook.test.ts
git commit -m "feat(backend): implement Lemon Squeezy webhook handler and worker router"
```

---

### Task 4: Extension Thin-Client Migration, Auth & Pro GitHub PAT Storage

**Files:**
- Create: `src/extension/api/backendClient.ts`
- Create: `src/extension/auth/supabaseAuth.ts`
- Modify: `src/extension/storage.ts`
- Modify: `src/extension/spanishSummary.ts`
- Modify: `src/features/repository/index.ts`
- Test: `src/extension/tests/backendClient.test.ts`

**Interfaces:**
- Consumes: `/v1/analyze` and `/v1/config` from Cloudflare Worker.
- Produces:
  - `fetchRepoIntelligence(owner: string, repo: string, commitSha: string): Promise<FilteredAnalysisResult>`
  - `initiateProUpgrade(): Promise<void>`
  - `getStoredGitHubToken(): Promise<string>`

- [ ] **Step 1: Write failing test for extension backend client with fallback**

```typescript
// src/extension/tests/backendClient.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchRepoIntelligence } from '../api/backendClient'

describe('Extension Backend Client', () => {
  it('sends X-Client-Signature for anonymous requests and handles 429 quota reached', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ error: 'QUOTA_EXCEEDED', message: 'Daily free limit reached' })
    })
    await expect(fetchRepoIntelligence('torvalds', 'linux', 'sha123')).rejects.toThrow('Daily free limit reached')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/extension/tests/backendClient.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement client, Supabase OAuth trigger, and update preferences**

Implement `backendClient.ts` with hardware/canvas fingerprint generation, integrate Supabase Auth GitHub login, preserve local `githubToken` in `chrome.storage.local` with clean Pro requirement label, and wire report views to display backend intelligence and Pro upgrade CTA.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/extension/tests/backendClient.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/extension/api src/extension/auth src/extension/storage.ts src/extension/spanishSummary.ts src/extension/tests
git commit -m "feat(extension): migrate to thin-client backend API and Supabase auth"
```

---

### Task 5: Admin Control Panel (Cloudflare Pages)

**Files:**
- Create: `admin/src/app/page.tsx` (Dashboard & Telemetry)
- Create: `admin/src/app/prompts/page.tsx` (Prompt & Mascot Studio)
- Create: `admin/src/app/flags/page.tsx` (Feature Flags & Quotas)
- Create: `admin/src/app/users/page.tsx` (User & Subscription Management)
- Create: `admin/src/app/cache/page.tsx` (Cache Explorer & Invalidation)
- Create: `admin/src/lib/kv-sync.ts` (Immediate sync to Cloudflare KV)
- Test: `admin/tests/kv-sync.test.ts`

**Interfaces:**
- Consumes: Supabase tables `remote_configs`, `profiles`, `subscriptions`, `query_logs`, `repo_analyses`.
- Produces: Real-time config editor updating Supabase + Cloudflare KV REST API in <1 second.

- [ ] **Step 1: Write failing test for Admin KV Sync pipeline**

```typescript
// admin/tests/kv-sync.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncConfigToCloudflareKV } from '../src/lib/kv-sync'

describe('Admin KV Sync', () => {
  it('dual writes configuration changes to Supabase and Cloudflare KV API', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }
    const res = await syncConfigToCloudflareKV('free_daily_limit', 15, mockSupabase as any)
    expect(res.success).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/values/free_daily_limit'),
      expect.objectContaining({ method: 'PUT' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run admin/tests/kv-sync.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Admin dashboard pages and KV sync service**

Build the admin interface with Tailwind/Tremor: Telemetry overview, System Prompts live editor, Feature Flags/Quota sliders, User Pro status toggler, and Cache purge button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run admin/tests/kv-sync.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add admin/
git commit -m "feat(admin): build administrative control panel with KV dual-write sync"
```

---

### Task 6: Pro Floating Mascot & Real-Time Streaming Chat

**Files:**
- Create: `src/features/mascot/FloatingMascot.tsx`
- Create: `src/features/mascot/MascotChatWindow.tsx`
- Create: `backend/src/ai/mascot-chat.ts`
- Modify: `backend/src/worker.ts`
- Test: `backend/tests/mascot-chat.test.ts`

**Interfaces:**
- Consumes: `/v1/mascot/chat` with SSE streaming.
- Produces: Floating mascot widget injected into GitHub DOM, deducting from the 250 unified daily Pro quota.

- [ ] **Step 1: Write failing test for mascot chat quota deduction and streaming setup**

```typescript
// backend/tests/mascot-chat.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleMascotChatRequest } from '../src/ai/mascot-chat'

describe('Mascot Chat Handler', () => {
  it('deducts from the unified 250 daily Pro quota and rejects when quota is exhausted', async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue('250'),
      put: vi.fn()
    } as any
    const req = {
      userId: 'pro-user-1',
      messages: [{ role: 'user', content: 'What does this repo do?' }],
      repoContext: { owner: 'facebook', repo: 'react' }
    }
    await expect(handleMascotChatRequest(req, mockKv)).rejects.toThrow('PRO_QUOTA_EXHAUSTED')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run backend/tests/mascot-chat.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement mascot chat endpoint and extension floating widget**

Implement `handleMascotChatRequest` with Server-Sent Events (SSE) streaming, link to the unified quota limiter in Cloudflare KV, and add `FloatingMascot.tsx` to the GitHub DOM content script.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/mascot-chat.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/mascot backend/src/ai/mascot-chat.ts backend/tests/mascot-chat.test.ts
git commit -m "feat(mascot): implement floating mascot widget with streaming SSE chat"
```
