'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { CreditCard, Crown, RefreshCw, Search, Shield, UserCheck } from 'lucide-react'
import { AdminShell, SectionCard, StatusBanner } from '../../lib/admin-shell'
import type { ProfileRow, SubscriptionRow } from '../../lib/admin-types'
import {
  type AdminSession,
  type AdminSupabaseClient,
  fetchProfiles,
  fetchSubscriptions
} from '../../lib/supabase-client'

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  past_due: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  expired: 'bg-slate-700/40 text-slate-300 border-slate-600'
}

function UsersManagementContent({ client }: { client: AdminSupabaseClient; session: AdminSession }) {
  const [search, setSearch] = useState('')
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadData = useCallback(
    async (queryText = search, userFilter = selectedUserId) => {
      setLoading(true)
      const [profilesRes, subsRes] = await Promise.all([
        fetchProfiles(client, queryText),
        fetchSubscriptions(client, userFilter ?? undefined)
      ])
      const errors = [profilesRes.error, subsRes.error].filter(Boolean)
      if (errors.length > 0) {
        setStatus({ type: 'error', message: `Failed to load user records: ${errors.join(' | ')}` })
      }
      setProfiles(profilesRes.data)
      setSubscriptions(subsRes.data)
      setLoading(false)
    },
    [client, search, selectedUserId]
  )

  useEffect(() => {
    void loadData('', null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  async function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault()
    await loadData(search, selectedUserId)
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
      setStatus({ type: 'error', message: error.message ?? 'Failed to update profile Pro status' })
      return
    }

    setProfiles((prev) =>
      prev.map((row) => (row.id === profile.id ? { ...row, is_pro: nextPro } : row))
    )
    setStatus({
      type: 'success',
      message: `${profile.email} Pro membership ${nextPro ? 'enabled' : 'revoked'}.`
    })
  }

  async function handleSelectUser(userId: string | null) {
    setSelectedUserId(userId)
    const subsRes = await fetchSubscriptions(client, userId ?? undefined)
    if (subsRes.error) {
      setStatus({ type: 'error', message: `Failed to load subscriptions: ${subsRes.error}` })
    }
    setSubscriptions(subsRes.data)
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <SectionCard
        title="User Directory & Pro Entitlements"
        description="Search profiles by email or UUID and manually grant or revoke Pro access."
        actions={
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or UUID..."
                className="rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => void loadData(search, selectedUserId)}
              className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-300"
              aria-label="Refresh users"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 pr-4">User</th>
                <th className="py-2.5 pr-4">Role</th>
                <th className="py-2.5 pr-4">Lemon Customer</th>
                <th className="py-2.5 pr-4">Pro Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    {loading ? 'Loading profiles...' : 'No matching users found.'}
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => {
                  const isSelected = selectedUserId === profile.id
                  return (
                    <tr
                      key={profile.id}
                      className={isSelected ? 'bg-indigo-500/5' : 'hover:bg-slate-800/30'}
                    >
                      <td className="py-3 pr-4">
                        <div className="font-medium text-white">{profile.email}</div>
                        <div className="font-mono text-[11px] text-slate-400">{profile.id}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            profile.role === 'admin'
                              ? 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {profile.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-300">
                        {profile.lemon_customer_id ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            profile.is_pro
                              ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                              : 'border-slate-700 bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Crown className="w-3 h-3" />
                          {profile.is_pro ? 'Pro' : 'Free'}
                        </span>
                      </td>
                      <td className="py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleSelectUser(isSelected ? null : profile.id)}
                          className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] text-slate-200"
                        >
                          {isSelected ? 'Show All Subs' : 'View Subs'}
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === profile.id}
                          onClick={() => void handleTogglePro(profile)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            profile.is_pro
                              ? 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          <UserCheck className="w-3 h-3" />
                          {updatingId === profile.id
                            ? 'Updating...'
                            : profile.is_pro
                              ? 'Revoke Pro'
                              : 'Grant Pro'}
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

      <SectionCard
        title="Lemon Squeezy Subscription History"
        description={
          selectedUserId
            ? `Filtered for user ${selectedUserId}`
            : 'Recent subscription webhook records synced from /v1/webhooks/lemonsqueezy'
        }
        actions={
          selectedUserId && (
            <button
              type="button"
              onClick={() => void handleSelectUser(null)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:text-white"
            >
              Clear User Filter
            </button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 pr-4">Subscription ID</th>
                <th className="py-2.5 pr-4">User ID</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4">Variant ID</th>
                <th className="py-2.5">Period End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No subscription records found.
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-4 font-mono text-white flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      {sub.lemon_subscription_id}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-400">{sub.user_id ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_BADGE[sub.status] ?? STATUS_BADGE.expired
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-300">{sub.variant_id ?? '—'}</td>
                    <td className="py-3 text-slate-300">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}

export function UsersManagementView({
  injectedClient,
  injectedSession
}: {
  injectedClient?: AdminSupabaseClient
  injectedSession?: AdminSession
} = {}) {
  return (
    <AdminShell
      activeRoute="/users"
      title="User & Subscription Management"
      subtitle="Search user accounts, manage manual Pro grants, and inspect Lemon Squeezy subscription events."
      injectedClient={injectedClient}
      injectedSession={injectedSession}
    >
      {({ client, session }) => <UsersManagementContent client={client} session={session} />}
    </AdminShell>
  )
}

export default function UsersManagementPage() {
  return <UsersManagementView />
}
