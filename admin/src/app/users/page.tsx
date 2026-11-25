'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  CreditCard,
  Crown,
  RefreshCw,
  Save,
  Search,
  Shield,
  UserCheck,
  UserPlus
} from 'lucide-react'
import { AdminShell, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  DEFAULT_NEW_USER_TIER,
  type DefaultUserTier,
  type ProfileRow,
  type SubscriptionRow
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchProfiles,
  fetchRemoteConfigsMap,
  fetchSubscriptions
} from '../../lib/supabase-client'

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  past_due: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  expired: 'bg-slate-700/40 text-slate-300 border-slate-600'
}

function UsersContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Default New User Tier Policy State
  const [defaultTier, setDefaultTier] = useState<DefaultUserTier>(DEFAULT_NEW_USER_TIER)
  const [savedDefaultTier, setSavedDefaultTier] = useState<DefaultUserTier>(DEFAULT_NEW_USER_TIER)
  const [savingTier, setSavingTier] = useState(false)

  const loadData = useCallback(
    async (searchTerm?: string, currentSelectedId?: string | null) => {
      setLoading(true)
      setStatus(null)

      const [profilesRes, subsRes, configsMap] = await Promise.all([
        fetchProfiles(client, searchTerm),
        fetchSubscriptions(client, currentSelectedId ?? undefined),
        fetchRemoteConfigsMap(client)
      ])

      setLoading(false)

      if (profilesRes.error) {
        setStatus({ type: 'error', message: `Error al cargar perfiles: ${profilesRes.error}` })
      } else {
        setProfiles(profilesRes.data)
      }

      if (subsRes.error) {
        setStatus({ type: 'error', message: `Error al cargar suscripciones: ${subsRes.error}` })
      } else {
        setSubscriptions(subsRes.data)
      }

      // Sync default_new_user_tier
      const rawTier = configsMap.default_new_user_tier
      if (rawTier === 'pro' || rawTier === 'free') {
        setDefaultTier(rawTier)
        setSavedDefaultTier(rawTier)
      } else {
        setDefaultTier(DEFAULT_NEW_USER_TIER)
        setSavedDefaultTier(DEFAULT_NEW_USER_TIER)
      }
    },
    [client]
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleSaveDefaultTier() {
    setSavingTier(true)
    setStatus(null)

    const res = await dispatchServerConfigSync(
      'default_new_user_tier',
      defaultTier,
      session.accessToken
    )
    setSavingTier(false)

    if (res.success) {
      setSavedDefaultTier(defaultTier)
      setStatus({
        type: 'success',
        message: `Política de nuevo usuario guardada: Ahora todos los nuevos registros recibirán nivel ${defaultTier.toUpperCase()} automáticamente.`
      })
    } else {
      setStatus({
        type: 'error',
        message: res.error ?? 'Error al guardar la política de nuevo usuario en KV y Supabase.'
      })
    }
  }

  async function handleTogglePro(profile: ProfileRow) {
    const nextPro = !profile.is_pro
    setUpdatingId(profile.id)
    setStatus(null)

    const { error } = await client
      .from('profiles')
      .update({ is_pro: nextPro })
      .eq('id', profile.id)

    setUpdatingId(null)

    if (error) {
      setStatus({ type: 'error', message: `Error al actualizar estado Pro: ${error.message}` })
      return
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, is_pro: nextPro } : p))
    )
    setStatus({
      type: 'success',
      message: `Actualizado ${profile.email || profile.id} -> Membresía Pro: ${nextPro ? 'HABILITADA' : 'REVOCADA'}`
    })
  }

  async function handleToggleRole(profile: ProfileRow) {
    const nextRole: 'admin' | 'user' = profile.role === 'admin' ? 'user' : 'admin'
    if (
      profile.id === session.userId &&
      nextRole === 'user' &&
      !window.confirm('Degradarte de admin revocará tu propio acceso a este panel. ¿Continuar?')
    ) {
      return
    }

    setUpdatingId(profile.id)
    setStatus(null)

    const { error } = await client
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', profile.id)

    setUpdatingId(null)

    if (error) {
      setStatus({ type: 'error', message: `Error al actualizar rol: ${error.message}` })
      return
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, role: nextRole } : p))
    )
    setStatus({
      type: 'success',
      message: `Actualizado ${profile.email || profile.id} -> Rol: ${nextRole}`
    })
  }

  async function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault()
    await loadData(search.trim(), selectedUserId)
  }

  async function handleSelectUser(userId: string | null) {
    setSelectedUserId(userId)
    const subsRes = await fetchSubscriptions(client, userId ?? undefined)
    if (subsRes.error) {
      setStatus({ type: 'error', message: `Error al cargar suscripciones: ${subsRes.error}` })
    }
    setSubscriptions(subsRes.data)
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* New User Default Role / Tier Policy */}
      <SectionCard
        title="Rol / Nivel por Defecto para Nuevos Usuarios"
        description="Configura qué plan o membresía recibirán automáticamente todas las cuentas nuevas al registrarse por primera vez."
        actions={
          <button
            type="button"
            onClick={() => void handleSaveDefaultTier()}
            disabled={savingTier || defaultTier === savedDefaultTier}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-indigo-600/20 active:scale-[0.98]"
          >
            <Save className="size-3.5" />
            {savingTier ? 'Guardando...' : 'Guardar Política'}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => setDefaultTier('free')}
            className={`cursor-pointer rounded-2xl border p-5 transition-all ${
              defaultTier === 'free'
                ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/40'
                : 'border-white/5 bg-[#090d16]/70 hover:border-white/15'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-slate-800 text-slate-300 border border-white/5">
                  <Shield className="size-4" />
                </div>
                <span className="font-semibold text-white text-sm">Free (Plan Gratuito)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] text-slate-400 border border-white/10 font-mono">
                  Por defecto
                </span>
                {savedDefaultTier === 'free' && (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30 font-medium">
                    Activo
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Los nuevos usuarios inician con límites diarios estándar (15 consultas/día) y acceso a los módulos gratuitos. Es la opción recomendada.
            </p>
          </div>

          <div
            onClick={() => setDefaultTier('pro')}
            className={`cursor-pointer rounded-2xl border p-5 transition-all ${
              defaultTier === 'pro'
                ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40'
                : 'border-white/5 bg-[#090d16]/70 hover:border-white/15'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Crown className="size-4" />
                </div>
                <span className="font-semibold text-white text-sm">Pro (Membresía Completa)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] text-amber-300 border border-amber-500/30 font-mono">
                  Promoción
                </span>
                {savedDefaultTier === 'pro' && (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30 font-medium">
                    Activo
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cualquier nuevo usuario registrado recibe automáticamente estatus Pro activo (<code className="text-amber-300">is_pro = true</code>), con 250 consultas/día y todos los módulos habilitados.
            </p>
          </div>
        </div>

        {defaultTier !== savedDefaultTier && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-xs text-indigo-200 hero-in">
            <span>
              Tienes cambios sin guardar. Haz clic en <strong>Guardar Política</strong> para aplicar a Cloudflare KV y Supabase.
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Directorio de Usuarios & Permisos Pro"
        description="Busca perfiles por email o UUID, y administra manualmente privilegios de administrador o membresía Pro."
        actions={
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por email o UUID..."
                className="w-48 sm:w-64 rounded-xl border border-white/10 bg-[#090d16] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => void loadData(search, selectedUserId)}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2 text-slate-300 transition"
              aria-label="Refrescar usuarios"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px] font-semibold bg-white/[0.02]">
              <tr>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Cliente Lemon</th>
                <th className="py-3 px-4">Estado Pro</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {loading ? 'Cargando usuarios...' : 'No se encontraron usuarios coincidentes.'}
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => {
                  const isSelected = selectedUserId === profile.id
                  return (
                    <tr
                      key={profile.id}
                      className={`transition-colors ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 font-bold text-[10px] border border-indigo-500/20">
                            {profile.email?.slice(0, 2).toUpperCase() || 'US'}
                          </div>
                          <div>
                            <div className="font-semibold text-white tracking-tight">{profile.email}</div>
                            <div className="font-mono text-[10px] text-slate-400">{profile.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                            profile.role === 'admin'
                              ? 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300'
                              : 'border-white/10 bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Shield className="size-3" />
                          {profile.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {profile.lemon_customer_id ?? '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                            profile.is_pro
                              ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                              : 'border-white/10 bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Crown className="size-3" />
                          {profile.is_pro ? 'PRO ACTIVO' : 'FREE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleTogglePro(profile)}
                          disabled={updatingId === profile.id}
                          className={`rounded-xl border px-3 py-1 text-xs font-semibold transition ${
                            profile.is_pro
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          }`}
                        >
                          {profile.is_pro ? 'Revocar Pro' : 'Otorgar Pro'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRole(profile)}
                          disabled={updatingId === profile.id}
                          className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs text-slate-300 hover:text-white transition"
                        >
                          {profile.role === 'admin' ? 'Hacer Usuario' : 'Hacer Admin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectUser(isSelected ? null : profile.id)}
                          className={`rounded-xl border px-3 py-1 text-xs transition ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {isSelected ? 'Ocultar' : 'Suscripción'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Subscription details drawer */}
      {selectedUserId && (
        <SectionCard
          title={`Suscripciones LemonSqueezy: ${selectedUserId}`}
          description="Historial de eventos de pago y webhooks procesados para este usuario."
          actions={
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs text-slate-300"
            >
              Cerrar
            </button>
          }
        >
          {subscriptions.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No hay registros de suscripción asociados a este ID.</p>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-xl border border-white/5 bg-[#090d16]/70 p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-white flex items-center gap-2">
                      <CreditCard className="size-3.5 text-indigo-400" />
                      {sub.lemon_subscription_id}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        STATUS_BADGE[sub.status] ?? 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {sub.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] pt-1">
                    <div>Fin de período: {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}</div>
                    <div>Actualizado: {new Date(sub.updated_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

export default function UsersManagementPage() {
  return (
    <AdminShell
      activeRoute="/users"
      title="Gestión de Usuarios & Membresías"
      subtitle="Administra roles de acceso, membresías Pro de Supabase y la política de nivel por defecto para nuevos registros."
    >
      {({ client, session }) => <UsersContent client={client} session={session} />}
    </AdminShell>
  )
}
