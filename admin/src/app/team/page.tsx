'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import { AdminShell, KpiCard, SectionCard, StatusBanner } from '../../lib/admin-shell'
import {
  ADMIN_ROLE_DEFINITIONS,
  DEFAULT_TEAM_RBAC_CONFIG,
  type AdminPermission,
  type AdminRole,
  type TeamMemberItem,
  type TeamRbacConfig
} from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  dispatchServerConfigSync,
  fetchRemoteConfigsMap,
  recordAdminAuditLog
} from '../../lib/supabase-client'

const PERMISSION_ROWS: { key: AdminPermission; label: string; description: string }[] = [
  { key: 'manage_keys', label: 'Gestión de API Keys & Pools', description: 'Crear, rotar y probar API keys de LLMs.' },
  { key: 'manage_prompts', label: 'Prompts & Mascota', description: 'Editar system prompts del análisis y de la mascota.' },
  { key: 'manage_flags', label: 'Feature Flags & Cuotas', description: 'Ajustar límites de cuota diaria y modo mantenimiento.' },
  { key: 'manage_campaigns', label: 'Campañas de Banners Dock', description: 'Publicar ofertas y cupones en el dock de GitHub.' },
  { key: 'manage_billing', label: 'Facturación & Pasarelas', description: 'Configurar Stripe, Polar, Lemon Squeezy o Paddle.' },
  { key: 'manage_releases', label: 'Versiones & What\'s New', description: 'Fijar versión mínima requerida y modal de novedades.' },
  { key: 'manage_notifications', label: 'Notificaciones In-App', description: 'Publicar anuncios dirigidos en la campana de la extensión.' },
  { key: 'manage_team', label: 'Gestión del Equipo RBAC', description: 'Invitar y revocar accesos a otros administradores.' },
  { key: 'view_analytics', label: 'Telemetría & FinOps', description: 'Ver analíticas de uso, costes de IA y CSAT de usuarios.' },
  { key: 'export_data', label: 'Exportación de Datos GDPR', description: 'Descargar registros y copias de seguridad de la base de datos.' }
]

export function TeamContent({
  client,
  session
}: {
  client: AdminSupabaseClient
  session: AdminSession
}) {
  const [config, setConfig] = useState<TeamRbacConfig>({ ...DEFAULT_TEAM_RBAC_CONFIG })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AdminRole>('developer')
  const [inviteDept, setInviteDept] = useState('Ingeniería de Software')

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetchRemoteConfigsMap(client)
    setLoading(false)

    if (res.data?.team_rbac_config && typeof res.data.team_rbac_config === 'object') {
      const saved = res.data.team_rbac_config as Partial<TeamRbacConfig>
      if (Array.isArray(saved.members)) {
        setConfig((prev) => ({
          ...prev,
          ...saved,
          members: saved.members!
        }))
      }
    }
  }, [client])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async (updatedConfig: TeamRbacConfig) => {
    setSaving(true)
    setStatus(null)
    setConfig(updatedConfig)

    const syncRes = await dispatchServerConfigSync(
      'team_rbac_config',
      updatedConfig,
      session.accessToken
    )

    if (syncRes.success) {
      setStatus({
        type: 'success',
        message: 'Equipo y roles de acceso RBAC sincronizados con éxito en KV y Supabase.'
      })
      await recordAdminAuditLog(
        client,
        session.user.email,
        'update_team_rbac',
        'team_rbac_config',
        { membersCount: updatedConfig.members.length }
      )
    } else {
      setStatus({
        type: 'error',
        message: `Error al sincronizar: ${syncRes.error || 'Error'}`
      })
    }
    setSaving(false)
  }

  const handleInviteMember = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setStatus({ type: 'error', message: 'Nombre y correo electrónico son requeridos.' })
      return
    }

    if (config.members.some((m) => m.email.toLowerCase() === inviteEmail.trim().toLowerCase())) {
      setStatus({ type: 'error', message: 'Ya existe un miembro del equipo con este correo.' })
      return
    }

    const newMember: TeamMemberItem = {
      id: `mem-${Date.now()}`,
      email: inviteEmail.trim().toLowerCase(),
      name: inviteName.trim(),
      role: inviteRole,
      status: 'active',
      department: inviteDept.trim() || 'General',
      createdAt: new Date().toISOString()
    }

    const updated = {
      ...config,
      members: [...config.members, newMember]
    }

    await handleSave(updated)
    setShowInviteModal(false)
    setInviteName('')
    setInviteEmail('')
    setInviteRole('developer')
  }

  const handleRemoveMember = async (id: string, email: string) => {
    if (email === session.user.email) {
      alert('No puedes eliminar tu propia cuenta de administrador activa.')
      return
    }
    if (!confirm(`¿Seguro que deseas revocar el acceso a ${email}?`)) return

    const updated = {
      ...config,
      members: config.members.filter((m) => m.id !== id)
    }
    await handleSave(updated)
  }

  const handleChangeRole = async (id: string, newRole: AdminRole) => {
    const updated = {
      ...config,
      members: config.members.map((m) => (m.id === id ? { ...m, role: newRole } : m))
    }
    await handleSave(updated)
  }

  const handleToggleStatus = async (id: string) => {
    const updated = {
      ...config,
      members: config.members.map((m) =>
        m.id === id ? { ...m, status: m.status === 'active' ? 'disabled' : 'active' } : m
      )
    }
    await handleSave(updated)
  }

  const superAdminsCount = config.members.filter((m) => m.role === 'super_admin').length
  const devsCount = config.members.filter((m) => m.role === 'developer').length

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
          title="Miembros del Panel"
          value={config.members.length.toString()}
          hint="Administradores y operadores activos"
          icon={Users}
          trend="up"
        />
        <KpiCard
          title="Super Administradores"
          value={superAdminsCount.toString()}
          hint="Control total de claves y finanzas"
          icon={ShieldCheck}
          trend="neutral"
        />
        <KpiCard
          title="Ingenieros / Developers"
          value={devsCount.toString()}
          hint="Gestión técnica de IA, prompts y flags"
          icon={UserCheck}
          trend="up"
        />
        <KpiCard
          title="Autenticación 2FA"
          value={config.enforce2fa ? 'Obligatoria' : 'Opcional'}
          hint={config.enforce2fa ? 'Seguridad estricta activada' : 'Recomendado activar'}
          icon={Lock}
          trend={config.enforce2fa ? 'up' : 'down'}
        />
      </div>

      {/* Team Members List */}
      <SectionCard
        title="Miembros del Equipo & Asignación de Roles"
        description="Administra los administradores con acceso a este panel de control y asigna roles granulares."
        action={
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500"
          >
            <UserPlus className="size-3.5" />
            Invitar Miembro
          </button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-slate-950/40 text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-medium">Usuario / Nombre</th>
                <th className="py-2.5 px-3 font-medium">Departamento</th>
                <th className="py-2.5 px-3 font-medium">Rol Asignado</th>
                <th className="py-2.5 px-3 font-medium text-center">Estado</th>
                <th className="py-2.5 px-3 font-medium">Último Acceso</th>
                <th className="py-2.5 px-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {config.members.map((m) => {
                const roleDef = ADMIN_ROLE_DEFINITIONS[m.role]
                const isCurrentUser = m.email === session.user.email
                return (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-xs font-bold text-white shadow">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white">{m.name}</span>
                            {isCurrentUser && (
                              <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[9px] font-bold text-indigo-300">
                                TÚ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{m.department || 'General'}</td>
                    <td className="py-3 px-3">
                      <select
                        value={m.role}
                        disabled={isCurrentUser}
                        onChange={(e) => handleChangeRole(m.id, e.target.value as AdminRole)}
                        className={`rounded-lg border px-2 py-1 text-xs font-medium ${roleDef.badgeColor} bg-slate-900`}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="developer">Ingeniero / Dev</option>
                        <option value="marketing_support">Marketing & Soporte</option>
                        <option value="analyst_read_only">Analista (Solo Lectura)</option>
                      </select>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        disabled={isCurrentUser}
                        onClick={() => handleToggleStatus(m.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          m.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            m.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        {m.status === 'active' ? 'Activo' : 'Deshabilitado'}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : 'Pendiente'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        disabled={isCurrentUser}
                        onClick={() => handleRemoveMember(m.id, m.email)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30"
                        title={isCurrentUser ? 'No puedes eliminarte a ti mismo' : 'Revocar acceso'}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Role Permission Matrix */}
      <SectionCard
        title="Matriz Granular de Permisos por Rol (RBAC)"
        description="Consulta las capacidades exactas asignadas a cada perfil de usuario en el sistema."
      >
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-slate-950/40 text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-medium">Módulo / Permiso</th>
                <th className="py-2.5 px-3 font-medium text-center">Super Admin</th>
                <th className="py-2.5 px-3 font-medium text-center">Ingeniero / Dev</th>
                <th className="py-2.5 px-3 font-medium text-center">Marketing</th>
                <th className="py-2.5 px-3 font-medium text-center">Analista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.key} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-white">{row.label}</p>
                    <span className="text-[11px] text-slate-400">{row.description}</span>
                  </td>
                  {/* Super Admin */}
                  <td className="py-2.5 px-3 text-center">
                    <Check className="mx-auto size-4 text-emerald-400" />
                  </td>
                  {/* Developer */}
                  <td className="py-2.5 px-3 text-center">
                    {ADMIN_ROLE_DEFINITIONS.developer.permissions.includes(row.key) ||
                    ADMIN_ROLE_DEFINITIONS.developer.permissions.includes('all') ? (
                      <Check className="mx-auto size-4 text-emerald-400" />
                    ) : (
                      <X className="mx-auto size-4 text-slate-600" />
                    )}
                  </td>
                  {/* Marketing */}
                  <td className="py-2.5 px-3 text-center">
                    {ADMIN_ROLE_DEFINITIONS.marketing_support.permissions.includes(row.key) ||
                    ADMIN_ROLE_DEFINITIONS.marketing_support.permissions.includes('all') ? (
                      <Check className="mx-auto size-4 text-emerald-400" />
                    ) : (
                      <X className="mx-auto size-4 text-slate-600" />
                    )}
                  </td>
                  {/* Analyst */}
                  <td className="py-2.5 px-3 text-center">
                    {ADMIN_ROLE_DEFINITIONS.analyst_read_only.permissions.includes(row.key) ||
                    ADMIN_ROLE_DEFINITIONS.analyst_read_only.permissions.includes('all') ? (
                      <Check className="mx-auto size-4 text-emerald-400" />
                    ) : (
                      <X className="mx-auto size-4 text-slate-600" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="size-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Invitar Nuevo Administrador</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="carlos@empresa.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Rol Asignado
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as AdminRole)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="developer">Ingeniero / Dev</option>
                    <option value="marketing_support">Marketing & Soporte</option>
                    <option value="analyst_read_only">Analista</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Departamento
                  </label>
                  <input
                    type="text"
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    placeholder="Ingeniería"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInviteMember}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                Enviar Invitación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeamPage() {
  return (
    <AdminShell
      activeRoute="/team"
      title="Equipo & Control de Acceso RBAC"
      subtitle="Gestiona los administradores del panel, define roles granulares y supervisa la matriz de permisos de seguridad."
    >
      {({ client, session }) => <TeamContent client={client} session={session} />}
    </AdminShell>
  )
}
