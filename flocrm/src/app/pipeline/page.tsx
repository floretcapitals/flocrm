'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lead, Profile } from '@/types'

const PKR = (n: number) => 'PKR ' + Math.round(n).toLocaleString()

const STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-50 text-blue-800 border-blue-100' },
  { key: 'contacted', label: 'Contacted', color: 'bg-amber-50 text-amber-800 border-amber-100' },
  { key: 'account_opened', label: 'Account Opened', color: 'bg-green-50 text-green-800 border-green-100' },
  { key: 'am_handling', label: 'AM Handling', color: 'bg-purple-50 text-purple-800 border-purple-100' },
  { key: 'trading', label: 'Trading', color: 'bg-teal-50 text-teal-800 border-teal-100' },
]

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [bdoFilter, setBdoFilter] = useState('')
  const [amFilter, setAmFilter] = useState('')
  const [search, setSearch] = useState('')
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: me } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMyProfile(me as Profile)

    const { data: p } = await supabase.from('profiles').select('*').eq('is_active', true)
    setProfiles((p || []) as Profile[])

    let leadsQuery = supabase.from('leads').select('*, deposits(*)')
    if (me?.role === 'bdo') {
      leadsQuery = leadsQuery.eq('bdo_id', user.id)
    } else if (me?.role === 'am') {
      const myBdoIds = ((p || []) as Profile[])
        .filter(pr => pr.role === 'bdo' && pr.reports_to === user.id)
        .map(pr => pr.id)
      if (myBdoIds.length) {
        leadsQuery = leadsQuery.or(`am_id.eq.${user.id},bdo_id.in.(${myBdoIds.join(',')})`)
      } else {
        leadsQuery = leadsQuery.eq('am_id', user.id)
      }
    } else if (me?.role === 'trading') {
      leadsQuery = leadsQuery.eq('analyst_id', user.id)
    }

    const { data: l } = await leadsQuery.order('updated_at', { ascending: false })
    setLeads((l || []) as Lead[])
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function moveStage(lead: Lead, newStage: string) {
    await supabase.from('leads').update({ stage: newStage }).eq('id', lead.id)
    fetchData()
  }

  const isAdmin = myProfile?.role === 'admin'
  const isAm = myProfile?.role === 'am'
  const bdos = profiles.filter(p => p.role === 'bdo')
  const ams = profiles.filter(p => p.role === 'am')
  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '-'

  const amBdoIds = amFilter
    ? profiles.filter(p => p.role === 'bdo' && p.reports_to === amFilter).map(p => p.id)
    : []

  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    if (bdoFilter && l.bdo_id !== bdoFilter) return false
    if (amFilter && l.am_id !== amFilter && !amBdoIds.includes(l.bdo_id || '')) return false
    return true
  })

  const totalDep = (lead: Lead) => (lead.deposits || []).reduce((s, d) => s + d.amount, 0)
  const hasActiveFilters = bdoFilter || amFilter || search

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-medium">Pipeline</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} leads</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <input
          className="flex-1 min-w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          placeholder="Search client..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {(isAdmin || isAm) && (
          <select
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
            value={bdoFilter} onChange={e => setBdoFilter(e.target.value)}>
            <option value="">All BDOs</option>
            {bdos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {isAdmin && (
          <select
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
            value={amFilter} onChange={e => setAmFilter(e.target.value)}>
            <option value="">All AMs</option>
            {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {hasActiveFilters && (
          <button
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
            onClick={() => { setBdoFilter(''); setAmFilter(''); setSearch('') }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Pipeline board */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
        {STAGES.map(stage => {
          const stageLeads = filtered.filter(l => l.stage === stage.key)
          const stageDep = stageLeads.reduce((s, l) => s + totalDep(l), 0)
          return (
            <div key={stage.key}>
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-2 border text-xs font-medium ${stage.color}`}>
                <span>{stage.label}</span>
                <span className="opacity-70">{stageLeads.length}</span>
              </div>
              {stageDep > 0 && (
                <div className="text-xs text-gray-400 text-center mb-2">
                  {PKR(stageDep)}
                </div>
              )}
              <div className="space-y-2">
                {stageLeads.map(lead => (
                  <div key={lead.id}
                    className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
                    <div className="font-medium text-sm mb-0.5">{lead.name}</div>
                    <div className="text-xs text-gray-400 mb-1">{lead.city || '-'}</div>
                    {(isAdmin || isAm) && (
                      <div className="text-xs text-gray-400 mb-1">
                        BDO: {memberName(lead.bdo_id)}
                      </div>
                    )}
                    {isAdmin && lead.am_id && (
                      <div className="text-xs text-gray-400 mb-1">
                        AM: {memberName(lead.am_id)}
                      </div>
                    )}
                    {totalDep(lead) > 0 && (
                      <div className="text-xs font-medium text-blue-600 mb-2">
                        {PKR(totalDep(lead))}
                      </div>
                    )}
                    <div className="flex gap-1 flex-wrap mt-2">
                      {STAGES.filter(s => s.key !== stage.key).map(s => (
                        <button key={s.key}
                          onClick={() => moveStage(lead, s.key)}
                          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                          {s.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!stageLeads.length && (
                  <div className="text-center py-6 text-xs text-gray-300 border border-dashed border-gray-200 rounded-xl">
                    Empty
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
