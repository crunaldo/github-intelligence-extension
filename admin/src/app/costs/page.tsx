'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Coins,
  DollarSign,
  Flame,
  Info,
  Layers,
  LineChart,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  ALL_PROVIDERS,
  DEFAULT_FINOPS_BUDGET_CONFIG,
  DEFAULT_PROVIDER_PRICING,
  type FinOpsBudgetConfig,
  type ProviderName,
  type ProviderPricingModel
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function CostsContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [budgetConfig, setBudgetConfig] = useState<FinOpsBudgetConfig>({
    ...DEFAULT_FINOPS_BUDGET_CONFIG
  })
  const [pricingModels, setPricingModels] =
    useState<Record<ProviderName, ProviderPricingModel>>(DEFAULT_PROVIDER_PRICING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Interactive Simulator State
  const [simMonthlyQueries, setSimMonthlyQueries] = useState<number>(25000)
  const [simAvgInputTokens, setSimAvgInputTokens] = useState<number>(2800)
  const [simAvgOutputTokens, setSimAvgOutputTokens] = useState<number>(1200)

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.finops_budget_config && typeof res.data.finops_budget_config === 'object') {
      const saved = res.data.finops_budget_config as Partial<FinOpsBudgetConfig>
      setBudgetConfig((prev) => ({
        ...prev,
        ...saved
      }))
    }

    if (res.data?.finops_pricing_models && typeof res.data.finops_pricing_models === 'object') {
      const savedPricing = res.data.finops_pricing_models as Record<ProviderName, ProviderPricingModel>
      setPricingModels((prev) => ({
        ...prev,
        ...savedPricing
      }))
    }
  }, [client])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)

    const syncBudget = await dispatchServerConfigSync(
      'finops_budget_config',
      budgetConfig,
      session.accessToken
    )

    const syncPricing = await dispatchServerConfigSync(
      'finops_pricing_models',
      pricingModels,
      session.accessToken
    )

    if (syncBudget.success && syncPricing.success) {
      setStatus({
        type: 'success',
        message: 'Límites presupuestarios y modelos de precios de IA sincronizados con éxito.'
      })
      await recordAdminAuditLog(
        client,
        session.user.email,
        'update_finops_config',
        'finops_budget_config',
        {
          monthlyBudgetUsd: budgetConfig.monthlyBudgetUsd,
          dailyBudgetUsd: budgetConfig.dailyBudgetUsd,
          hardStopEnabled: budgetConfig.hardStopEnabled,
          notifyViaTelegram: budgetConfig.notifyViaTelegram
        }
      )
    } else {
      setStatus({
        type: 'error',
        message: `Error al sincronizar configuración: ${syncBudget.error || syncPricing.error || 'Error'}`
      })
    }
    setSaving(false)
  }

  // Cost calculations for simulator
  const simCalculations = useMemo(() => {
    const totalInputTokens = simMonthlyQueries * simAvgInputTokens
    const totalOutputTokens = simMonthlyQueries * simAvgOutputTokens

    const costsByProvider: Record<ProviderName, number> = {
      gemini:
        (totalInputTokens / 1_000_000) * pricingModels.gemini.inputCostPerMillion +
        (totalOutputTokens / 1_000_000) * pricingModels.gemini.outputCostPerMillion,
      groq:
        (totalInputTokens / 1_000_000) * pricingModels.groq.inputCostPerMillion +
        (totalOutputTokens / 1_000_000) * pricingModels.groq.outputCostPerMillion,
      cfAi:
        (totalInputTokens / 1_000_000) * pricingModels.cfAi.inputCostPerMillion +
        (totalOutputTokens / 1_000_000) * pricingModels.cfAi.outputCostPerMillion,
      openRouter:
        (totalInputTokens / 1_000_000) * pricingModels.openRouter.inputCostPerMillion +
        (totalOutputTokens / 1_000_000) * pricingModels.openRouter.outputCostPerMillion
    }

    // Benchmark vs OpenAI GPT-4o ($2.50 in / $10.00 out)
    const benchmarkGpt4o =
      (totalInputTokens / 1_000_000) * 2.5 + (totalOutputTokens / 1_000_000) * 10.0

    const avgOurPortfolioCost =
      (costsByProvider.gemini * 0.5 +
        costsByProvider.groq * 0.25 +
        costsByProvider.cfAi * 0.15 +
        costsByProvider.openRouter * 0.1)

    const savingsPercentage = Math.round(((benchmarkGpt4o - avgOurPortfolioCost) / benchmarkGpt4o) * 100)

    const costPerAnalysis = avgOurPortfolioCost / simMonthlyQueries

    return {
      costsByProvider,
      benchmarkGpt4o,
      avgOurPortfolioCost,
      savingsPercentage,
      costPerAnalysis
    }
  }, [simMonthlyQueries, simAvgInputTokens, simAvgOutputTokens, pricingModels])

  // Mocked / Current Live Stats
  const currentMonthlySpend = 28.45
  const currentDailySpend = 1.12
  const budgetUsagePercent = Math.round((currentMonthlySpend / (budgetConfig.monthlyBudgetUsd || 150)) * 100)

  return (
    <div className="space-y-6">
      {status && (
        <StatusBanner
          type={status.type}
          message={status.message}
          onDismiss={() => setStatus(null)}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Gasto Mensual Estimado"
          value={`$${currentMonthlySpend.toFixed(2)} USD`}
          hint={`Límite fijado: $${budgetConfig.monthlyBudgetUsd} USD (${budgetUsagePercent}% consumido)`}
          icon={DollarSign}
          trend={budgetUsagePercent > budgetConfig.alertThresholdPercent ? 'down' : 'up'}
        />
        <KpiCard
          title="Gasto Diario Actual"
          value={`$${currentDailySpend.toFixed(2)} USD`}
          hint={`Límite de alerta: $${budgetConfig.dailyBudgetUsd} USD/día`}
          icon={Coins}
          trend="neutral"
        />
        <KpiCard
          title="Costo Promedio por Repo"
          value={`$${simCalculations.costPerAnalysis.toFixed(5)}`}
          hint="Calculado con mezcla Gemini Flash + Groq Llama 3.3"
          icon={Zap}
          trend="up"
        />
        <KpiCard
          title="Ahorro vs OpenAI GPT-4o"
          value={`${simCalculations.savingsPercentage}%`}
          hint={`Ahorro de ~$${(simCalculations.benchmarkGpt4o - simCalculations.avgOurPortfolioCost).toFixed(2)}/mes`}
          icon={TrendingDown}
          trend="up"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Budget Controls & Pricing Rates */}
        <div className="space-y-6 lg:col-span-7">
          <SectionCard
            title="Guardian de Presupuesto & Alertas FinOps"
            description="Define techos de gasto mensual y diario para evitar sorpresas por spikes de uso o ataques de tráfico."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Presupuesto Mensual Máximo (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-slate-500">$</span>
                    <input
                      type="number"
                      step="5"
                      value={budgetConfig.monthlyBudgetUsd}
                      onChange={(e) =>
                        setBudgetConfig((prev) => ({
                          ...prev,
                          monthlyBudgetUsd: Number(e.target.value)
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900/60 pl-7 pr-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Alerta cuando supere el {budgetConfig.alertThresholdPercent}% ($
                    {((budgetConfig.monthlyBudgetUsd * budgetConfig.alertThresholdPercent) / 100).toFixed(2)})
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Presupuesto Diario Máximo (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-slate-500">$</span>
                    <input
                      type="number"
                      step="1"
                      value={budgetConfig.dailyBudgetUsd}
                      onChange={(e) =>
                        setBudgetConfig((prev) => ({
                          ...prev,
                          dailyBudgetUsd: Number(e.target.value)
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900/60 pl-7 pr-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tope de protección contra bucles infinitos en 24h.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Umbral de Alerta Preventiva</span>
                  <span className="font-bold text-indigo-400">{budgetConfig.alertThresholdPercent}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={budgetConfig.alertThresholdPercent}
                  onChange={(e) =>
                    setBudgetConfig((prev) => ({
                      ...prev,
                      alertThresholdPercent: Number(e.target.value)
                    }))
                  }
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 p-3.5">
                  <div>
                    <h5 className="text-xs font-semibold text-white">
                      Parada de Emergencia (Hard Stop AI)
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      Si el gasto mensual supera el 100% del presupuesto, conmuta temporalmente los análisis a modelos de bajo costo o modo restringido.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={budgetConfig.hardStopEnabled}
                    onChange={(e) =>
                      setBudgetConfig((prev) => ({
                        ...prev,
                        hardStopEnabled: e.target.checked
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-slate-800 text-rose-500 focus:ring-rose-500"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 p-3.5">
                  <div>
                    <h5 className="text-xs font-semibold text-white">
                      Alertas Automáticas vía Telegram Bot
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      Envía un mensaje instantáneo a tu canal de Telegram configurado cuando se alcance el umbral de alerta.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={budgetConfig.notifyViaTelegram}
                    onChange={(e) =>
                      setBudgetConfig((prev) => ({
                        ...prev,
                        notifyViaTelegram: e.target.checked
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Pricing Models Table */}
          <SectionCard
            title="Tarifas de Proveedores IA ($ / Millón de Tokens)"
            description="Ajusta los precios de inferencia según las actualizaciones de facturación de cada proveedor."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-2.5 font-medium">Proveedor / Modelo</th>
                    <th className="pb-2.5 font-medium">Input $/1M</th>
                    <th className="pb-2.5 font-medium">Output $/1M</th>
                    <th className="pb-2.5 font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ALL_PROVIDERS.map((provider) => {
                    const model = pricingModels[provider]
                    return (
                      <tr key={provider} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 font-medium text-white">
                          <p>{model.provider.toUpperCase()}</p>
                          <span className="text-[10px] text-slate-400">{model.modelName}</span>
                        </td>
                        <td className="py-2.5">
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1.5 text-[11px] text-slate-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={model.inputCostPerMillion}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setPricingModels((prev) => ({
                                  ...prev,
                                  [provider]: { ...prev[provider], inputCostPerMillion: val }
                                }))
                              }}
                              className="w-full rounded-lg border border-white/10 bg-slate-900/60 pl-5 pr-2 py-1 text-xs text-white"
                            />
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1.5 text-[11px] text-slate-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={model.outputCostPerMillion}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setPricingModels((prev) => ({
                                  ...prev,
                                  [provider]: { ...prev[provider], outputCostPerMillion: val }
                                }))
                              }}
                              className="w-full rounded-lg border border-white/10 bg-slate-900/60 pl-5 pr-2 py-1 text-xs text-white"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 text-[11px] text-slate-400">
                          {model.notes}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={loadData}
                disabled={loading || saving}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Restablecer
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Guardar Configuración FinOps
              </button>
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Live Simulator & Cost Projections */}
        <div className="space-y-6 lg:col-span-5">
          <SectionCard
            title="Simulador de Escala & Proyección de Costes"
            description="Estima tu factura mensual de IA al crecer el número de usuarios activos."
          >
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Análisis Mensuales Estimados</span>
                  <span className="font-bold text-white">
                    {simMonthlyQueries.toLocaleString()} repos
                  </span>
                </div>
                <input
                  type="range"
                  min="2000"
                  max="200000"
                  step="1000"
                  value={simMonthlyQueries}
                  onChange={(e) => setSimMonthlyQueries(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[11px] text-slate-400">Tokens Entrada / Repo</span>
                  <p className="text-sm font-bold text-white mt-0.5">{simAvgInputTokens}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[11px] text-slate-400">Tokens Salida / Repo</span>
                  <p className="text-sm font-bold text-white mt-0.5">{simAvgOutputTokens}</p>
                </div>
              </div>

              {/* Provider Cost Matrix */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <p className="text-xs font-semibold text-slate-300">
                  Costo Mensual Estimado por Proveedor:
                </p>

                {ALL_PROVIDERS.map((p) => {
                  const cost = simCalculations.costsByProvider[p]
                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/40 px-3.5 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-indigo-400" />
                        <span className="font-medium text-white">{p.toUpperCase()}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-white">${cost.toFixed(2)} USD</span>
                        <p className="text-[10px] text-slate-500">
                          ${(cost / simMonthlyQueries).toFixed(5)} / repo
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Benchmark vs GPT-4o Box */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300">
                    Ahorro vs OpenAI GPT-4o
                  </span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                    -{simCalculations.savingsPercentage}%
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Con OpenAI GPT-4o pagarías aprox.{' '}
                  <span className="font-bold text-white">
                    ${simCalculations.benchmarkGpt4o.toFixed(2)} USD
                  </span>
                  . Nuestra arquitectura de fallback inteligente te cuesta solo{' '}
                  <span className="font-bold text-emerald-400">
                    ${simCalculations.avgOurPortfolioCost.toFixed(2)} USD
                  </span>
                  .
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default function CostsPage() {
  return (
    <AdminShell
      activeRoute="/costs"
      title="FinOps & Costos de Inferencia IA"
      subtitle="Monitorea el consumo de tokens en dólares, simula costes a escala y configura guardianes de presupuesto para evitar sobrecostes."
    >
      {({ client, session }) => <CostsContent client={client} session={session} />}
    </AdminShell>
  )
}
