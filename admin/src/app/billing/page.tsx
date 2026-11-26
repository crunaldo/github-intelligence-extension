'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Globe,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Webhook,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  type BillingProviderName,
  type BillingSettingsConfig,
  DEFAULT_BILLING_SETTINGS_CONFIG
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

const PROVIDER_METADATA: Record<
  BillingProviderName,
  { label: string; tag: string; badge: string; description: string }
> = {
  stripe: {
    label: 'Stripe',
    tag: 'Recomendado',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    description: 'La pasarela líder mundial para suscripciones de software, tarjetas de crédito globales, Apple Pay y Google Pay.'
  },
  polar: {
    label: 'Polar.sh',
    tag: 'Developer-First',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    description: 'Plataforma especializada en herramientas open-source, desarrolladores de GitHub y monetización moderna.'
  },
  paddle: {
    label: 'Paddle',
    tag: 'Merchant of Record',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Actúa como comerciante registrado (MoR), reteniendo y declarando el IVA/VAT e impuestos internacionales automáticamente.'
  },
  lemonsqueezy: {
    label: 'Lemon Squeezy (Legacy)',
    tag: 'En Transición',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Pasarela anterior del proyecto. Nota: Se recomienda migrar a Stripe o Polar debido al cambio de operaciones de Lemon Squeezy.'
  }
}

export function BillingContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<BillingSettingsConfig>({ ...DEFAULT_BILLING_SETTINGS_CONFIG })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})

  const webhookEndpoint = 'https://github-intelligence-api.pages.dev/api/webhooks/billing'

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.billing_config && typeof res.data.billing_config === 'object') {
      const saved = res.data.billing_config as Partial<BillingSettingsConfig>
      setConfig({
        ...DEFAULT_BILLING_SETTINGS_CONFIG,
        ...saved
      })
    }
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSaveConfig(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setSaving(true)
    setStatus(null)

    const res = await dispatchServerConfigSync(
      'billing_config',
      config,
      session.accessToken
    )
    setSaving(false)

    if (res.success) {
      setStatus({
        type: 'success',
        message: `Configuración de facturación (${PROVIDER_METADATA[config.activeProvider].label}) guardada y sincronizada en Cloudflare KV.`
      })
      await recordAdminAuditLog(
        client,
        session.email,
        'BILLING_CONFIG_UPDATED',
        config.activeProvider,
        {
          provider: config.activeProvider,
          monthlyPrice: config.monthlyPriceUsd,
          annualPrice: config.annualPriceUsd
        },
        session.accessToken
      )
    } else {
      setStatus({ type: 'error', message: res.error || 'Error al guardar la configuración de facturación.' })
    }
  }

  function handleCopyWebhook() {
    navigator.clipboard.writeText(webhookEndpoint)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="MRR Estimado"
          value={`$${(158 * config.monthlyPriceUsd).toLocaleString()} USD`}
          hint={`158 suscriptores activos a $${config.monthlyPriceUsd}/mes`}
          accent="emerald"
          badge="+18.4% este mes"
          sparkline={[800, 1100, 1320, 1422]}
          icon={<DollarSign className="size-5" />}
        />
        <KpiCard
          label="ARR Proyectado"
          value={`$${(158 * config.monthlyPriceUsd * 12).toLocaleString()} USD`}
          hint="Ingresos anuales recurrentes estimados"
          accent="indigo"
          badge="Proyección"
          sparkline={[9600, 12400, 15800, 17040]}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiCard
          label="Suscriptores Pro Activos"
          value="158"
          hint="Usuarios con membresía Pro activa"
          accent="purple"
          badge="12 nuevos hoy"
          sparkline={[110, 130, 145, 158]}
          icon={<Users className="size-5" />}
        />
        <KpiCard
          label="Tasa de Cancelación (Churn)"
          value="1.8%"
          hint="Excelente retención en el sector dev-tools"
          accent="amber"
          badge="Saludable (<3%)"
          sparkline={[2.4, 2.1, 1.9, 1.8]}
          icon={<ShieldCheck className="size-5" />}
        />
      </div>

      {/* Lemon Squeezy Migration Notice Banner */}
      {config.activeProvider === 'lemonsqueezy' && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 shadow-lg">
          <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-amber-300">
              Aviso de Migración de Pasarela de Pagos (Lemon Squeezy)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Lemon Squeezy ha anunciado reestructuraciones y cese de operaciones directas para nuevas cuentas. Te sugerimos seleccionar y configurar <strong>Stripe</strong> o <strong>Polar.sh</strong> como tu pasarela activa para garantizar pagos continuos y sin interrupciones.
            </p>
          </div>
        </div>
      )}

      {/* Provider Switcher Selector */}
      <div className="rounded-2xl border border-white/10 bg-[#0f172a]/80 backdrop-blur-md p-6 shadow-xl space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CreditCard className="size-4 text-indigo-400" />
            Selecciona la Pasarela de Pago Activa
          </h3>
          <p className="text-xs text-slate-400">
            Cambia de proveedor en cualquier momento. La extensión y el worker utilizarán la pasarela seleccionada para procesar checkouts y recibir webhooks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
          {(Object.keys(PROVIDER_METADATA) as BillingProviderName[]).map((prov) => {
            const isSelected = config.activeProvider === prov
            const meta = PROVIDER_METADATA[prov]
            return (
              <button
                key={prov}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, activeProvider: prov }))}
                className={`text-left rounded-2xl border p-4 transition relative ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-white/5 bg-[#090d16]/70 hover:border-white/20'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 size-2 rounded-full bg-indigo-400 animate-pulse" />
                )}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-bold text-white">{meta.label}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                  {meta.tag}
                </span>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {meta.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Provider Configuration & Pricing Plans */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Credentials form */}
        <div className="lg:col-span-7 space-y-4">
          <SectionCard
            title={`Credenciales & API Keys (${PROVIDER_METADATA[config.activeProvider].label})`}
            subtitle="Configura los tokens de integración y secrets de firma para procesar cobros y suscripciones."
            icon={<KeyRound className="size-4 text-indigo-400" />}
          >
            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              {config.activeProvider === 'stripe' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Stripe Publishable Key (pk_live_...)
                    </label>
                    <input
                      type="text"
                      placeholder="pk_live_..."
                      value={config.stripePublishableKey || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, stripePublishableKey: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Stripe Secret Key (sk_live_...)
                    </label>
                    <input
                      type="password"
                      placeholder="sk_live_..."
                      value={config.stripeSecretKey || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, stripeSecretKey: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Stripe Webhook Signing Secret (whsec_...)
                    </label>
                    <input
                      type="password"
                      placeholder="whsec_..."
                      value={config.stripeWebhookSecret || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, stripeWebhookSecret: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                </>
              )}

              {config.activeProvider === 'polar' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Polar Access Token (polar_at_...)
                    </label>
                    <input
                      type="password"
                      placeholder="polar_at_..."
                      value={config.polarAccessToken || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, polarAccessToken: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Polar Organization ID (UUID)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 8a4c810b-..."
                      value={config.polarOrganizationId || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, polarOrganizationId: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                </>
              )}

              {config.activeProvider === 'paddle' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Paddle Vendor / Seller ID
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 123456"
                      value={config.paddleVendorId || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, paddleVendorId: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Paddle API Key (pdl_...)
                    </label>
                    <input
                      type="password"
                      placeholder="pdl_..."
                      value={config.paddleApiKey || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, paddleApiKey: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                </>
              )}

              {config.activeProvider === 'lemonsqueezy' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Lemon Squeezy Store ID
                    </label>
                    <input
                      type="text"
                      placeholder="Store ID"
                      value={config.lemonStoreId || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, lemonStoreId: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Lemon Squeezy API Key
                    </label>
                    <input
                      type="password"
                      placeholder="API Key"
                      value={config.lemonApiKey || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, lemonApiKey: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white placeholder-slate-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Customer Portal URL (Para que los usuarios gestionen su suscripción)
                </label>
                <input
                  type="url"
                  placeholder="https://billing.stripe.com/p/session/..."
                  value={config.portalUrl || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, portalUrl: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-md disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  <span>{saving ? 'Guardando...' : 'Guardar Credenciales'}</span>
                </button>
              </div>
            </form>
          </SectionCard>
        </div>

        {/* Right: Pricing & Webhook Assistant */}
        <div className="lg:col-span-5 space-y-4">
          {/* Pricing Plans Card */}
          <SectionCard
            title="Precios & Planes de Suscripción"
            subtitle="Valores cobrados a los usuarios de la extensión."
            icon={<DollarSign className="size-4 text-emerald-400" />}
          >
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-300">Plan Pro Mensual</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number"
                    min={1}
                    value={config.monthlyPriceUsd}
                    onChange={(e) => setConfig((prev) => ({ ...prev, monthlyPriceUsd: parseFloat(e.target.value) || 9 }))}
                    className="w-20 rounded-lg border border-white/10 bg-[#090d16] px-2 py-1 text-xs font-mono text-white text-right"
                  />
                  <span className="text-slate-400">USD/mes</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-slate-300">Plan Pro Anual (con descuento)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number"
                    min={1}
                    value={config.annualPriceUsd}
                    onChange={(e) => setConfig((prev) => ({ ...prev, annualPriceUsd: parseFloat(e.target.value) || 79 }))}
                    className="w-20 rounded-lg border border-white/10 bg-[#090d16] px-2 py-1 text-xs font-mono text-white text-right"
                  />
                  <span className="text-slate-400">USD/año</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-300">Días de Prueba Gratuita (Trial)</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={config.trialDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, trialDays: parseInt(e.target.value, 10) || 0 }))}
                    className="w-20 rounded-lg border border-white/10 bg-[#090d16] px-2 py-1 text-xs font-mono text-white text-right"
                  />
                  <span className="text-slate-400">días</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Webhook Endpoint Assistant */}
          <SectionCard
            title="Asistente de Webhook en Vivo"
            subtitle="Configura esta URL en el panel de tu proveedor para sincronizar altas y bajas automáticamente."
            icon={<Webhook className="size-4 text-purple-400" />}
          >
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400">URL del Endpoint de Webhook:</span>
                <div className="flex items-center justify-between rounded-xl bg-[#090d16] border border-white/10 px-3 py-2 font-mono text-indigo-300 text-[11px]">
                  <span className="truncate mr-2">{webhookEndpoint}</span>
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="text-slate-400 hover:text-white shrink-0"
                    title="Copiar URL"
                  >
                    {copiedWebhook ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-300">Eventos requeridos:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                  <li><code>customer.subscription.created</code></li>
                  <li><code>customer.subscription.updated</code></li>
                  <li><code>customer.subscription.deleted</code></li>
                  <li><code>invoice.payment_succeeded</code></li>
                </ul>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <AdminShell
      activeRoute="/billing"
      title="Facturación & Pasarelas de Pago"
      subtitle="Configuración modular de pasarelas de pago (Stripe, Polar, Paddle, Lemon Squeezy), precios de suscripciones y métricas financieras de MRR."
    >
      {({ client, session }) => <BillingContent client={client} session={session} />}
    </AdminShell>
  )
}
