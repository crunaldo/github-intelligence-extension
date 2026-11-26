'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Crown,
  Eye,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
  Zap
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  type AccessControlConfig,
  type BannedIpEntry,
  type BannedUserEntry,
  DEFAULT_ACCESS_CONTROL_CONFIG,
  type VipIpEntry,
  type VipUserEntry
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

export function AccessContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<AccessControlConfig>({ ...DEFAULT_ACCESS_CONTROL_CONFIG })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [activeTab, setActiveTab] = useState<'vip' | 'banned' | 'rules'>('vip')
  const [searchQuery, setSearchQuery] = useState('')

  // Add VIP Modal / Form
  const [showAddVip, setShowAddVip] = useState(false)
  const [vipType, setVipType] = useState<'user' | 'ip'>('user')
  const [vipTarget, setVipTarget] = useState('')
  const [vipNote, setVipNote] = useState('')

  // Add Ban Modal / Form
  const [showAddBan, setShowAddBan] = useState(false)
  const [banType, setBanType] = useState<'ip' | 'user'>('ip')
  const [banTarget, setBanTarget] = useState('')
  const [banReason, setBanReason] = useState('Abuso de peticiones / Scraping masivo')

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.access_control_rules && typeof res.data.access_control_rules === 'object') {
      const saved = res.data.access_control_rules as Partial<AccessControlConfig>
      setConfig({
        bannedIpHashes: Array.isArray(saved.bannedIpHashes) ? saved.bannedIpHashes : [],
        bannedUserIds: Array.isArray(saved.bannedUserIds) ? saved.bannedUserIds : [],
        vipUserIds: Array.isArray(saved.vipUserIds) ? saved.vipUserIds : [],
        vipIpHashes: Array.isArray(saved.vipIpHashes) ? saved.vipIpHashes : [],
        rateLimitPerMinute: typeof saved.rateLimitPerMinute === 'number' ? saved.rateLimitPerMinute : 60,
        autoBanThresholdPerMin: typeof saved.autoBanThresholdPerMin === 'number' ? saved.autoBanThresholdPerMin : 120
      })
    }
  }, [client])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function persistConfig(newConfig: AccessControlConfig, successMsg: string, auditAction: string, targetName: string) {
    setSaving(true)
    setStatus(null)
    const res = await dispatchServerConfigSync(
      'access_control_rules',
      newConfig,
      session.accessToken
    )
    setSaving(false)

    if (res.success) {
      setConfig(newConfig)
      setStatus({ type: 'success', message: successMsg })
      await recordAdminAuditLog(
        client,
        session.email,
        auditAction,
        targetName,
        { activeVips: newConfig.vipUserIds.length + newConfig.vipIpHashes.length, activeBans: newConfig.bannedUserIds.length + newConfig.bannedIpHashes.length },
        session.accessToken
      )
    } else {
      setStatus({ type: 'error', message: res.error || 'Error al guardar la regla de acceso.' })
    }
  }

  // Handle Add VIP
  async function handleAddVip(e: React.FormEvent) {
    e.preventDefault()
    const target = vipTarget.trim()
    if (!target) return

    let nextConfig = { ...config }
    if (vipType === 'user') {
      const newEntry: VipUserEntry = {
        userId: target,
        email: target.includes('@') ? target : undefined,
        note: vipNote.trim() || 'Acceso VIP prioritario',
        addedAt: new Date().toISOString()
      }
      nextConfig = {
        ...nextConfig,
        vipUserIds: [newEntry, ...nextConfig.vipUserIds.filter((v) => v.userId !== target)]
      }
    } else {
      const newEntry: VipIpEntry = {
        ipHash: target,
        note: vipNote.trim() || 'IP VIP autorizada',
        addedAt: new Date().toISOString()
      }
      nextConfig = {
        ...nextConfig,
        vipIpHashes: [newEntry, ...nextConfig.vipIpHashes.filter((v) => v.ipHash !== target)]
      }
    }

    await persistConfig(
      nextConfig,
      `Identificador "${target}" añadido a la lista VIP con éxito.`,
      'VIP_ADDED',
      target
    )
    setVipTarget('')
    setVipNote('')
    setShowAddVip(false)
  }

  // Handle Remove VIP
  async function handleRemoveVip(target: string, type: 'user' | 'ip') {
    if (!window.confirm(`¿Remover "${target}" de la lista VIP?`)) return

    const nextConfig: AccessControlConfig = {
      ...config,
      vipUserIds: type === 'user' ? config.vipUserIds.filter((v) => v.userId !== target) : config.vipUserIds,
      vipIpHashes: type === 'ip' ? config.vipIpHashes.filter((v) => v.ipHash !== target) : config.vipIpHashes
    }

    await persistConfig(
      nextConfig,
      `VIP "${target}" removido.`,
      'VIP_REMOVED',
      target
    )
  }

  // Handle Add Ban
  async function handleAddBan(e: React.FormEvent) {
    e.preventDefault()
    const target = banTarget.trim()
    if (!target) return

    let nextConfig = { ...config }
    if (banType === 'ip') {
      const newEntry: BannedIpEntry = {
        ipHash: target,
        reason: banReason.trim(),
        createdAt: new Date().toISOString(),
        bannedBy: session.email
      }
      nextConfig = {
        ...nextConfig,
        bannedIpHashes: [newEntry, ...nextConfig.bannedIpHashes.filter((b) => b.ipHash !== target)]
      }
    } else {
      const newEntry: BannedUserEntry = {
        userId: target,
        email: target.includes('@') ? target : undefined,
        reason: banReason.trim(),
        createdAt: new Date().toISOString(),
        bannedBy: session.email
      }
      nextConfig = {
        ...nextConfig,
        bannedUserIds: [newEntry, ...nextConfig.bannedUserIds.filter((b) => b.userId !== target)]
      }
    }

    await persistConfig(
      nextConfig,
      `"${target}" ha sido bloqueado y añadido a la lista negra.`,
      'ACCESS_BANNED',
      target
    )
    setBanTarget('')
    setShowAddBan(false)
  }

  // Handle Remove Ban
  async function handleRemoveBan(target: string, type: 'ip' | 'user') {
    if (!window.confirm(`¿Desbloquear "${target}" y restaurar su acceso?`)) return

    const nextConfig: AccessControlConfig = {
      ...config,
      bannedIpHashes: type === 'ip' ? config.bannedIpHashes.filter((b) => b.ipHash !== target) : config.bannedIpHashes,
      bannedUserIds: type === 'user' ? config.bannedUserIds.filter((b) => b.userId !== target) : config.bannedUserIds
    }

    await persistConfig(
      nextConfig,
      `"${target}" ha sido desbloqueado.`,
      'ACCESS_UNBANNED',
      target
    )
  }

  const totalVips = config.vipUserIds.length + config.vipIpHashes.length
  const totalBans = config.bannedUserIds.length + config.bannedIpHashes.length

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Identificadores VIP (Whitelist)"
          value={totalVips}
          hint={`${config.vipUserIds.length} usuarios · ${config.vipIpHashes.length} IPs`}
          accent="amber"
          badge="Sin límite"
          sparkline={[1, 2, 2, totalVips || 2]}
          icon={<Crown className="size-5" />}
        />
        <KpiCard
          label="Bloqueos Activos (Blacklist)"
          value={totalBans}
          hint={`${config.bannedIpHashes.length} IPs · ${config.bannedUserIds.length} cuentas`}
          accent="rose"
          badge="HTTP 403"
          sparkline={[0, 1, 1, totalBans || 1]}
          icon={<Ban className="size-5" />}
        />
        <KpiCard
          label="Límite RPM por IP"
          value={`${config.rateLimitPerMinute} req/min`}
          hint="Protección ante ráfagas"
          accent="indigo"
          badge="Protegido"
          sparkline={[50, 60, 60, 60]}
          icon={<Shield className="size-5" />}
        />
        <KpiCard
          label="Umbral Auto-Baneo"
          value={`${config.autoBanThresholdPerMin} req/min`}
          hint="Baneo instantáneo en Edge"
          accent="purple"
          badge="Anti-DDoS"
          sparkline={[100, 120, 120, 120]}
          icon={<Zap className="size-5" />}
        />
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('vip')}
          className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'vip'
              ? 'border-amber-500 text-amber-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Crown className="size-3.5" />
          <span>Lista VIP ({totalVips})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('banned')}
          className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'banned'
              ? 'border-rose-500 text-rose-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Ban className="size-3.5" />
          <span>Lista Negra / Bloqueados ({totalBans})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'rules'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="size-3.5" />
          <span>Reglas Anti-Abuso & Rate Limits</span>
        </button>
      </div>

      {/* Tab 1: VIP List */}
      {activeTab === 'vip' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar VIP por ID o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddVip(!showAddVip)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-amber-600/20"
            >
              <Plus className="size-3.5" />
              <span>{showAddVip ? 'Cancelar' : 'Agregar VIP'}</span>
            </button>
          </div>

          {showAddVip && (
            <form
              onSubmit={handleAddVip}
              className="rounded-2xl border border-amber-500/30 bg-[#0f172a]/95 backdrop-blur-xl p-5 space-y-3 shadow-xl"
            >
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                <Crown className="size-4" />
                Nuevo Registro en Lista VIP Whitelist (Cuota Ilimitada)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tipo</label>
                  <select
                    value={vipType}
                    onChange={(e) => setVipType(e.target.value as 'user' | 'ip')}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  >
                    <option value="user">Usuario (User ID / Email)</option>
                    <option value="ip">Hash de IP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {vipType === 'user' ? 'Email o User ID' : 'IP Hash (64 chars)'}
                  </label>
                  <input
                    type="text"
                    placeholder={vipType === 'user' ? 'juan@dev.com o UUID' : 'a4b8...'}
                    value={vipTarget}
                    onChange={(e) => setVipTarget(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Nota / Razón</label>
                  <input
                    type="text"
                    placeholder="ej. Fundador / Partner estratégico"
                    value={vipNote}
                    onChange={(e) => setVipNote(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddVip(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!vipTarget.trim() || saving}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-semibold text-slate-950 transition disabled:opacity-50"
                >
                  Confirmar VIP
                </button>
              </div>
            </form>
          )}

          {/* VIP Table */}
          <SectionCard
            title="Usuarios & IPs con Trato VIP"
            subtitle="Tienen consultas ilimitadas, omiten el rate limiter y reciben prioridad en la cola de inferencia."
            icon={<Crown className="size-4 text-amber-400" />}
          >
            {totalVips === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No hay usuarios ni IPs en la lista VIP actualmente.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-400">
                      <th className="py-2.5 px-3">Identificador</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Nota</th>
                      <th className="py-2.5 px-3">Agregado</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {config.vipUserIds
                      .filter((v) => !searchQuery || v.userId.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((u) => (
                        <tr key={u.userId} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-mono text-white flex items-center gap-2">
                            <Crown className="size-3.5 text-amber-400" />
                            <span>{u.email || u.userId}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px]">
                              Usuario
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{u.note || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(u.addedAt).toLocaleDateString()}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveVip(u.userId, 'user')}
                              className="text-slate-400 hover:text-rose-400 p-1 transition"
                              title="Remover VIP"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    {config.vipIpHashes
                      .filter((v) => !searchQuery || v.ipHash.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((i) => (
                        <tr key={i.ipHash} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-mono text-white flex items-center gap-2">
                            <Crown className="size-3.5 text-amber-400" />
                            <span>{i.ipHash.slice(0, 16)}...</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px]">
                              IP Hash
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{i.note || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(i.addedAt).toLocaleDateString()}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveVip(i.ipHash, 'ip')}
                              className="text-slate-400 hover:text-rose-400 p-1 transition"
                              title="Remover VIP"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Tab 2: Blacklist / Banned */}
      {activeTab === 'banned' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar baneo por IP hash o User ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d16] pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddBan(!showAddBan)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 px-4 py-2 text-xs font-semibold text-white transition shadow-md shadow-rose-600/20"
            >
              <UserX className="size-3.5" />
              <span>{showAddBan ? 'Cancelar' : 'Bloquear IP / Usuario'}</span>
            </button>
          </div>

          {showAddBan && (
            <form
              onSubmit={handleAddBan}
              className="rounded-2xl border border-rose-500/30 bg-[#0f172a]/95 backdrop-blur-xl p-5 space-y-3 shadow-xl"
            >
              <div className="text-xs font-semibold text-rose-300 flex items-center gap-2">
                <Ban className="size-4" />
                Bloqueo Inmediato (HTTP 403 Forbidden en el Edge)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tipo de Bloqueo</label>
                  <select
                    value={banType}
                    onChange={(e) => setBanType(e.target.value as 'ip' | 'user')}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  >
                    <option value="ip">Hash de IP (Anónimo / Extensión)</option>
                    <option value="user">Usuario (User ID / Email)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {banType === 'ip' ? 'Hash de IP' : 'User ID / Email'}
                  </label>
                  <input
                    type="text"
                    placeholder={banType === 'ip' ? 'ej. e3b0c44298fc1c149afbf4c8996fb924...' : 'UUID'}
                    value={banTarget}
                    onChange={(e) => setBanTarget(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Motivo</label>
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090d16] px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddBan(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!banTarget.trim() || saving}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  Aplicar Bloqueo
                </button>
              </div>
            </form>
          )}

          {/* Blacklist Table */}
          <SectionCard
            title="Lista Negra Activa"
            subtitle="Cualquier consulta proveniente de estos orígenes es rechazada inmediatamente con HTTP 403 Forbidden antes de invocar a los modelos."
            icon={<ShieldAlert className="size-4 text-rose-400" />}
          >
            {totalBans === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No hay bloqueos activos en el sistema.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-400">
                      <th className="py-2.5 px-3">Identificador Baneado</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Motivo</th>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {config.bannedIpHashes
                      .filter((b) => !searchQuery || b.ipHash.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((b) => (
                        <tr key={b.ipHash} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-mono text-rose-300 flex items-center gap-2">
                            <Ban className="size-3.5 text-rose-400" />
                            <span>{b.ipHash.slice(0, 20)}...</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px]">
                              IP Hash
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{b.reason}</td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(b.createdAt).toLocaleDateString()}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveBan(b.ipHash, 'ip')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 hover:border-emerald-500/30 text-slate-300 hover:text-emerald-300 text-[11px] transition"
                            >
                              <Unlock className="size-3" />
                              <span>Desbloquear</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    {config.bannedUserIds
                      .filter((b) => !searchQuery || b.userId.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((b) => (
                        <tr key={b.userId} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-mono text-rose-300 flex items-center gap-2">
                            <UserX className="size-3.5 text-rose-400" />
                            <span>{b.email || b.userId}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px]">
                              Usuario
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{b.reason}</td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(b.createdAt).toLocaleDateString()}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveBan(b.userId, 'user')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 hover:border-emerald-500/30 text-slate-300 hover:text-emerald-300 text-[11px] transition"
                            >
                              <Unlock className="size-3" />
                              <span>Desbloquear</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Tab 3: Rules & Rate Limits */}
      {activeTab === 'rules' && (
        <SectionCard
          title="Parámetros Globales Anti-Abuso & Rate Limiting"
          subtitle="Configura los umbrales de protección para evitar saturación de claves de IA y ataques volumétricos."
          icon={<ShieldCheck className="size-4 text-indigo-400" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl py-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-white">
                Límite Máximo por Minuto por IP
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={config.rateLimitPerMinute}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      rateLimitPerMinute: parseInt(e.target.value, 10) || 60
                    }))
                  }
                  className="w-32 rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white"
                />
                <span className="text-xs text-slate-400">peticiones / min</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Peticiones superiores a este límite responderán HTTP 429 Retry-After.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-white">
                Umbral de Auto-Baneo en Edge
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={60}
                  max={600}
                  value={config.autoBanThresholdPerMin}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      autoBanThresholdPerMin: parseInt(e.target.value, 10) || 120
                    }))
                  }
                  className="w-32 rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-xs font-mono text-white"
                />
                <span className="text-xs text-slate-400">peticiones / min</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Si una IP supera este valor en una ventana de 60s, se añade automáticamente a la lista negra por 24 horas.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-end">
            <button
              type="button"
              onClick={() =>
                void persistConfig(
                  config,
                  'Parámetros Anti-Abuso actualizados correctamente.',
                  'RATE_LIMIT_UPDATED',
                  'access_control_rules'
                )
              }
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              <Check className="size-3.5" />
              <span>{saving ? 'Guardando...' : 'Guardar Parámetros'}</span>
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

export default function AccessControlPage() {
  return (
    <AdminShell
      activeRoute="/access"
      title="Control de Acceso, VIP & Anti-Abuso"
      subtitle="Gestiona la Lista Negra (baneos por IP o usuario), Whitelist VIP con cuota ilimitada y umbrales de rate limit en el Edge."
    >
      {({ client, session }) => <AccessContent client={client} session={session} />}
    </AdminShell>
  )
}
