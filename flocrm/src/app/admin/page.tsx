'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildPool, distribute } from '@/lib/distribution'
import type { CommissionSettings, BdoTier, AmTier, TaTier, Profile, DistributionConfig, Lead } from '@/types'

interface AmDistConfig {
  am_id: string
  weight: number
  is_paused: boolean
  am?: Profile
}

export default function AdminPage() {
  const [tab, setTab] = useState<'commission'|'distribution'|'trading_comm'>('commission')
  const [distSubTab, setDistSubTab] = useState<'bdo'|'am'>('bdo')
  const [settings, setSettings] = useState<CommissionSettings | null>(null)
  const [bdoTiers, setBdoTiers] = useState<BdoTier[]>([])
  const [amTiers, setAmTiers] = useState<AmTier[]>([])
  const [taTiers, setTaTiers] = useState<TaTier[]>([])
  const [distConfigs, setDistConfigs] = useState<DistributionConfig[]>([])
  const [distMode, setDistMode] = useState<'roundrobin'|'weighted'>('roundrobin')
  const [distPointer, setDistPointer] = useState(0)
  const [unassigned, setUnassigned] = useState<Lead[]>([])
  const [assignments, setAssignments] = useState<Record<string,string>>({})
  const [amDistConfigs, setAmDistConfigs] = useState<AmDistConfig[]>([])
  const [amDistMode, setAmDistMode] = useState<'roundrobin'|'weighted'>('roundrobin')
  const [amDistPointer, setAmDistPointer] = useState(0)
  const [unassignedAm, setUnassignedAm] = useState<Lead[]>([])
  const [amAssignments, setAmAssignments] = useState<Record<string,string>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tcMonth, setTcMonth] = useState(new Date().toISOString().slice(0,7))
  const [tcData, setTcData] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const supabase = createClient()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const fetchAll = useCallback(async () => {
    const [{ data: s }, { data: bt }, { data: at }, { data: tt }, { data: dc }, { data: ds }, { data: ul }, { data: pr }, { data: ual }] = await Promise.all([
      supabase.from('commission_settings').select('*').single(),
      supabase.from('commission_bdo_tiers').select('*').order('sort_order'),
      supabase.from('commission_am_tiers').select('*'),
      supabase.from('commission_ta_tiers').select('*').order('min_commission'),
      supabase.from('distribution_config').select('*, bdo:profiles(*)'),
      supabase.from('distribution_state').select('*').eq('id', 1).single(),
      supabase.from('leads').select('*').is('bdo_id', null),
      supabase.from('profiles').select('*').eq('is_active', true),
      supabase.from('leads').select('*').is('am_id', null).eq('stage', 'am_handling'),
    ])
    if (s) setSettings(s as CommissionSettings)
    setBdoTiers((bt || []) as BdoTier[])
    setAmTiers((at || []) as AmTier[])
    setTaTiers((tt || []) as TaTier[])
    setProfiles((pr || []) as Profile[])
    setUnassigned((ul || []) as Lead[])
    setUnassignedAm((ual || []) as Lead[])

    const bdos = ((pr || []) as Profile[]).filter(p => p.role === 'bdo')
    const ams = ((pr || []) as Profile[]).filter(p => p.role === 'am')
    const configs = (dc || []) as any[]
    const merged: DistributionConfig[] = bdos.map(b => {
      const cfg = configs.find(c => c.bdo_id === b.id)
      return cfg ? { ...cfg, bdo: b } : { bdo_id: b.id, weight: 1, is_paused: false, bdo: b }
    })
    setDistConfigs(merged)
    setAmDistConfigs(ams.map(a => ({ am_id: a.id, weight: 1, is_paused: false, am: a })))
    if (ds) { setDistMode((ds as any).mode); setDistPointer((ds as any).global_pointer || 0) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Fetch TC entries for current month
  useEffect(() => {
    async function fetchTc() {
      const { data } = await supabase.from('trading_commissions').select('*, lead:leads(name, analyst_id)').eq('month', tcMonth)
      const map: Record<string, Record<string, number>> = {}
      ;(data || []).forEach((r: any) => {
        if (!map[r.analyst_id]) map[r.analyst_id] = {}
        map[r.analyst_id][r.lead_id] = r.commission_generated
      })
      setTcData(map)
    }
    fetchTc()
  }, [tcMonth])

  async function saveCommissionSettings() {
    if (!settings) return
    setSaving(true)
    await Promise.all([
      supabase.from('commission_settings').update({ ...settings, updated_at: new Date().toISOString() }).eq('id', settings.id),
      supabase.from('commission_bdo_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ])
    if (bdoTiers.length) {
      await supabase.from('commission_bdo_tiers').insert(bdoTiers.map(({ id, ...t }, i) => ({ ...t, sort_order: i })))
    }
    await supabase.from('commission_am_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (amTiers.length) await supabase.from('commission_am_tiers').insert(amTiers.map(({ id, ...t }) => t))
    await supabase.from('commission_ta_tiers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (taTiers.length) await supabase.from('commission_ta_tiers').insert(taTiers.map(({ id, ...t }) => t))
    setSaving(false); showToast('Commission settings saved')
  }

  async function saveDistribution() {
    await supabase.from('distribution_state').update({ mode: distMode, global_pointer: distPointer }).eq('id', 1)
    for (const cfg of distConfigs) {
      await supabase.from('distribution_config').upsert({ bdo_id: cfg.bdo_id, weight: cfg.weight, is_paused: cfg.is_paused }, { onConflict: 'bdo_id' })
    }
    showToast('Distribution settings saved')
  }

  function distributeAll() {
    const leadIds = unassigned.map(l => l.id)
    const { assignments: result, newPointer } = distribute(leadIds, distConfigs, distMode, distPointer)
    const map: Record<string,string> = {}
    result.forEach(r => { map[r.lead_id] = r.assigned_bdo_id })
    setAssignments(map)
    setDistPointer(newPointer)
  }

  async function confirmDistribution() {
    const entries = Object.entries(assignments)
    if (!entries.length) return
    await Promise.all(entries.map(([lead_id, bdo_id]) =>
      supabase.from('leads').update({ bdo_id, stage: 'new' }).eq('id', lead_id)
    ))
    setAssignments({})
    fetchAll()
    await supabase.from('distribution_state').update({ global_pointer: distPointer }).eq('id', 1)
    showToast(`${entries.length} leads assigned`)
  }

  function distributeAllAm() {
    const leadIds = unassignedAm.map(l => l.id)
    const active = amDistConfigs.filter(c => !c.is_paused && c.weight > 0)
    if (!active.length) return
    const pool = amDistMode === 'roundrobin' ? active : active.flatMap(c => Array(c.weight).fill(c))
    const map: Record<string, string> = {}
    let ptr = amDistPointer % pool.length
    for (const lid of leadIds) {
      map[lid] = pool[ptr].am_id
      ptr = (ptr + 1) % pool.length
    }
    setAmAssignments(map)
    setAmDistPointer(ptr)
  }

  async function confirmAmDistribution() {
    const entries = Object.entries(amAssignments)
    if (!entries.length) return
    await Promise.all(entries.map(([lead_id, am_id]) =>
      supabase.from('leads').update({ am_id }).eq('id', lead_id)
    ))
    setAmAssignments({})
    fetchAll()
    showToast(`${entries.length} leads assigned to AMs`)
  }

  async function saveTcEntry(analystId: string, leadId: string, val: number) {
    const existing = await supabase.from('trading_commissions').select('id').eq('lead_id', leadId).eq('month', tcMonth).single()
    if (existing.data) {
      await supabase.from('trading_commissions').update({ commission_generated: val, analyst_id: analystId }).eq('id', existing.data.id)
    } else {
      await supabase.from('trading_commissions').insert({ lead_id: leadId, analyst_id: analystId, month: tcMonth, commission_generated: val })
    }
  }

  async function approveTc(analystId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('trading_commissions').update({ approved: true, approved_by: user!.id, approved_at: new Date().toISOString() }).eq('analyst_id', analystId).eq('month', tcMonth)
    showToast('Payouts approved')
  }

  const s = settings
  const bdos = profiles.filter(p => p.role === 'bdo')
  const analysts = profiles.filter(p => p.role === 'trading')
  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '—'

  if (!s) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-medium">Admin</h1></div>

      {toast && <div className="mb-4 px-4 py-2.5 bg-green-50 text-green-800 rounded-lg text-sm border border-green-200">{toast}</div>}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([['commission','Commission Settings'],['distribution','Lead Distribution'],['trading_comm','Trading Commissions']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── COMMISSION SETTINGS ── */}
      {tab === 'commission' && (
        <div className="space-y-4">
          {/* BDO */}
          <div className="card">
            <div className="card-title flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-brand"></div>BDO Commission</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="label">Min accounts threshold</label><input className="input" type="number" value={s.bdo_acct_min_threshold} onChange={e => setSettings({...s, bdo_acct_min_threshold: +e.target.value})} /><p className="text-xs text-gray-400 mt-1">Accounts above this earn bonus</p></div>
              <div><label className="label">Per-account bonus (PKR)</label><input className="input" type="number" value={s.bdo_acct_bonus_per_account} onChange={e => setSettings({...s, bdo_acct_bonus_per_account: +e.target.value})} /></div>
              <div><label className="label">Deposit threshold (PKR)</label><input className="input" type="number" value={s.bdo_dep_threshold} onChange={e => setSettings({...s, bdo_dep_threshold: +e.target.value})} /></div>
              <div><label className="label">BDO share on AM clients (%)</label><input className="input" type="number" step="0.1" value={s.bdo_am_share_pct} onChange={e => setSettings({...s, bdo_am_share_pct: +e.target.value})} /></div>
              <div><label className="label">Payout cycle</label><select className="input" value={s.bdo_cycle} onChange={e => setSettings({...s, bdo_cycle: e.target.value})}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></div>
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Deposit commission tiers</div>
            <div className="table-wrap mb-2">
              <table className="data"><thead><tr><th>From (PKR)</th><th>To (PKR)</th><th>Rate (%)</th><th></th></tr></thead>
              <tbody>{bdoTiers.map((t,i) => (
                <tr key={i}>
                  <td><input className="input py-1" type="number" value={t.from_amount} onChange={e => { const n=[...bdoTiers]; n[i]={...n[i],from_amount:+e.target.value}; setBdoTiers(n) }} /></td>
                  <td><input className="input py-1" type="number" value={t.to_amount??''} placeholder="No limit" onChange={e => { const n=[...bdoTiers]; n[i]={...n[i],to_amount:e.target.value?+e.target.value:null}; setBdoTiers(n) }} /></td>
                  <td><input className="input py-1" type="number" step="0.01" value={t.commission_pct} onChange={e => { const n=[...bdoTiers]; n[i]={...n[i],commission_pct:+e.target.value}; setBdoTiers(n) }} /></td>
                  <td><button className="text-red-400 hover:text-red-600" onClick={() => setBdoTiers(bdoTiers.filter((_,j)=>j!==i))}>×</button></td>
                </tr>
              ))}</tbody></table>
            </div>
            <button className="text-xs text-brand" onClick={() => setBdoTiers([...bdoTiers, {id:'', from_amount:0, to_amount:null, commission_pct:0, sort_order:bdoTiers.length}])}>+ Add tier</button>
          </div>

          {/* AM */}
          <div className="card">
            <div className="card-title flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div>AM Commission</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="label">Clients per BDO target</label><input className="input" type="number" value={s.am_target_per_bdo} onChange={e => setSettings({...s, am_target_per_bdo: +e.target.value})} /></div>
              <div><label className="label">Min deposit to qualify (PKR)</label><input className="input" type="number" value={s.am_min_dep_qualify} onChange={e => setSettings({...s, am_min_dep_qualify: +e.target.value})} /></div>
              <div><label className="label">AM commission rate (%)</label><input className="input" type="number" step="0.1" value={s.am_dep_commission_pct} onChange={e => setSettings({...s, am_dep_commission_pct: +e.target.value})} /></div>
              <div><label className="label">Auto-escalate threshold (PKR)</label><input className="input" type="number" value={s.am_escalate_threshold} onChange={e => setSettings({...s, am_escalate_threshold: +e.target.value})} /></div>
              <div><label className="label">Payout cycle</label><select className="input" value={s.am_cycle} onChange={e => setSettings({...s, am_cycle: e.target.value})}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></div>
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Performance bonus tiers</div>
            <div className="table-wrap mb-2">
              <table className="data"><thead><tr><th>Target achieved (%)</th><th>Bonus (PKR)</th><th></th></tr></thead>
              <tbody>{amTiers.map((t,i) => (
                <tr key={i}>
                  <td><input className="input py-1" type="number" value={t.achieve_pct} onChange={e => { const n=[...amTiers]; n[i]={...n[i],achieve_pct:+e.target.value}; setAmTiers(n) }} /></td>
                  <td><input className="input py-1" type="number" value={t.bonus_amount} onChange={e => { const n=[...amTiers]; n[i]={...n[i],bonus_amount:+e.target.value}; setAmTiers(n) }} /></td>
                  <td><button className="text-red-400 hover:text-red-600" onClick={() => setAmTiers(amTiers.filter((_,j)=>j!==i))}>×</button></td>
                </tr>
              ))}</tbody></table>
            </div>
            <button className="text-xs text-brand" onClick={() => setAmTiers([...amTiers, {id:'', achieve_pct:100, bonus_amount:0}])}>+ Add tier</button>
          </div>

          {/* Trading Analyst */}
          <div className="card">
            <div className="card-title flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-teal-500"></div>Trading Analyst Commission</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="label">Base payout rate (%)</label><input className="input" type="number" step="0.5" value={s.ta_payout_pct} onChange={e => setSettings({...s, ta_payout_pct: +e.target.value})} /><p className="text-xs text-gray-400 mt-1">% of trading commission generated disbursed to analyst</p></div>
              <div><label className="label">Min commission to qualify (PKR)</label><input className="input" type="number" value={s.ta_min_comm_qualify} onChange={e => setSettings({...s, ta_min_comm_qualify: +e.target.value})} /></div>
              <div><label className="label">Max clients per analyst</label><input className="input" type="number" value={s.ta_max_clients} onChange={e => setSettings({...s, ta_max_clients: +e.target.value})} /></div>
              <div><label className="label">Payout cycle</label><select className="input" value={s.ta_cycle} onChange={e => setSettings({...s, ta_cycle: e.target.value})}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></div>
              <div><label className="label">Require approval</label><select className="input" value={s.ta_approval_required?'yes':'no'} onChange={e => setSettings({...s, ta_approval_required: e.target.value==='yes'})}><option value="yes">Yes</option><option value="no">No</option></select></div>
            </div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Performance tiers</div>
            <div className="table-wrap mb-2">
              <table className="data"><thead><tr><th>Min commission (PKR)</th><th>Payout rate (%)</th><th>Notes</th><th></th></tr></thead>
              <tbody>{taTiers.map((t,i) => (
                <tr key={i}>
                  <td><input className="input py-1" type="number" value={t.min_commission} onChange={e => { const n=[...taTiers]; n[i]={...n[i],min_commission:+e.target.value}; setTaTiers(n) }} /></td>
                  <td><input className="input py-1" type="number" step="0.5" value={t.payout_pct} onChange={e => { const n=[...taTiers]; n[i]={...n[i],payout_pct:+e.target.value}; setTaTiers(n) }} /></td>
                  <td><input className="input py-1" value={t.notes||''} onChange={e => { const n=[...taTiers]; n[i]={...n[i],notes:e.target.value}; setTaTiers(n) }} /></td>
                  <td><button className="text-red-400 hover:text-red-600" onClick={() => setTaTiers(taTiers.filter((_,j)=>j!==i))}>×</button></td>
                </tr>
              ))}</tbody></table>
            </div>
            <button className="text-xs text-brand" onClick={() => setTaTiers([...taTiers, {id:'', min_commission:0, payout_pct:s.ta_payout_pct, notes:''}])}>+ Add tier</button>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={saveCommissionSettings} disabled={saving}>{saving?'Saving…':'Save all commission settings'}</button>
          </div>
        </div>
      )}

      {/* ── DISTRIBUTION ── */}
      {tab === 'distribution' && (
        <div>
          {/* Sub-tabs */}
          <div className="flex gap-1 mb-5 border-b border-gray-200">
            {([['bdo', 'BDO Distribution'], ['am', 'AM Distribution']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setDistSubTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${distSubTab===key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
                {key === 'am' && unassignedAm.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{unassignedAm.length}</span>
                )}
                {key === 'bdo' && unassigned.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{unassigned.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── BDO Distribution ── */}
          {distSubTab === 'bdo' && (
            <div>
              <div className="card mb-4">
                <div className="card-title">Distribution mode</div>
                <div className="flex gap-2 mb-4">
                  {(['roundrobin','weighted'] as const).map(m => (
                    <button key={m} onClick={() => setDistMode(m)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${distMode===m ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m === 'roundrobin' ? 'Round Robin (equal)' : 'Weighted'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {distConfigs.map((cfg, i) => {
                    const active = distConfigs.filter(c => !c.is_paused && c.weight > 0)
                    const totalW = active.reduce((s,c) => s+c.weight, 0) || 1
                    const share = cfg.is_paused ? 0 : Math.round(cfg.weight / totalW * 100)
                    return (
                      <div key={cfg.bdo_id} className={`border rounded-xl p-4 ${cfg.is_paused ? 'opacity-50 border-gray-200' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium text-sm">{cfg.bdo?.name}</div>
                            <div className="text-xs text-gray-400">{cfg.is_paused ? 'Paused — no leads' : `~${share}% of leads`}</div>
                          </div>
                          <button className={`btn-secondary text-xs ${cfg.is_paused ? 'text-green-700' : ''}`}
                            onClick={() => { const n=[...distConfigs]; n[i]={...n[i], is_paused:!cfg.is_paused, weight: !cfg.is_paused ? 0 : 1}; setDistConfigs(n) }}>
                            {cfg.is_paused ? 'Resume' : 'Pause'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-12">Weight</span>
                          <input type="range" min="0" max="10" step="1" value={cfg.weight}
                            className="flex-1"
                            onChange={e => { const n=[...distConfigs]; const w=+e.target.value; n[i]={...n[i], weight:w, is_paused:w===0}; setDistConfigs(n) }} />
                          <span className="text-sm font-medium text-brand w-4">{cfg.weight}</span>
                        </div>
                        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cfg.is_paused ? 'bg-red-300' : 'bg-brand'}`} style={{ width: `${cfg.is_paused ? 100 : share}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-2 mt-4">
                  <button className="btn-secondary" onClick={saveDistribution}>Save settings</button>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium text-sm">Unassigned leads ({unassigned.length})</div>
                    <div className="text-xs text-gray-400 mt-0.5">Leads without a BDO assigned</div>
                  </div>
                  <div className="flex gap-2">
                    {Object.keys(assignments).length > 0 && (
                      <button className="btn-success" onClick={confirmDistribution}>Confirm {Object.keys(assignments).length} assignments</button>
                    )}
                    <button className="btn-primary" onClick={distributeAll} disabled={!unassigned.length || !distConfigs.some(c=>!c.is_paused)}>Distribute all</button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Client</th><th>City</th><th>Source</th><th>Assigned to</th></tr></thead>
                    <tbody>
                      {unassigned.map(l => (
                        <tr key={l.id}>
                          <td className="font-medium">{l.name}</td>
                          <td className="text-gray-500">{l.city||'—'}</td>
                          <td className="text-gray-500">{l.source||'—'}</td>
                          <td>
                            {assignments[l.id]
                              ? <span className="text-brand font-medium text-sm">{memberName(assignments[l.id])}</span>
                              : <select className="input py-1 text-xs" onChange={e => setAssignments(a=>({...a, [l.id]: e.target.value}))}>
                                  <option value="">— Assign manually —</option>
                                  {bdos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            }
                          </td>
                        </tr>
                      ))}
                      {!unassigned.length && <tr><td colSpan={4} className="text-center py-8 text-gray-400">All leads are assigned</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── AM Distribution ── */}
          {distSubTab === 'am' && (
            <div>
              <div className="card mb-4">
                <div className="card-title flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  AM Distribution mode
                </div>
                <div className="text-xs text-gray-500 bg-purple-50 px-3 py-2 rounded-lg mb-4">
                  Distribute leads at <span className="font-medium text-purple-700">AM Handling</span> stage (without an assigned AM) to your Account Managers.
                </div>
                <div className="flex gap-2 mb-4">
                  {(['roundrobin','weighted'] as const).map(m => (
                    <button key={m} onClick={() => setAmDistMode(m)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${amDistMode===m ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {m === 'roundrobin' ? 'Round Robin (equal)' : 'Weighted'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {amDistConfigs.map((cfg, i) => {
                    const active = amDistConfigs.filter(c => !c.is_paused && c.weight > 0)
                    const totalW = active.reduce((s,c) => s+c.weight, 0) || 1
                    const share = cfg.is_paused ? 0 : Math.round(cfg.weight / totalW * 100)
                    return (
                      <div key={cfg.am_id} className={`border rounded-xl p-4 ${cfg.is_paused ? 'opacity-50 border-gray-200' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium text-sm">{cfg.am?.name}</div>
                            <div className="text-xs text-gray-400">{cfg.is_paused ? 'Paused — no leads' : `~${share}% of leads`}</div>
                          </div>
                          <button className={`btn-secondary text-xs ${cfg.is_paused ? 'text-green-700' : ''}`}
                            onClick={() => { const n=[...amDistConfigs]; n[i]={...n[i], is_paused:!cfg.is_paused, weight: !cfg.is_paused ? 0 : 1}; setAmDistConfigs(n) }}>
                            {cfg.is_paused ? 'Resume' : 'Pause'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-12">Weight</span>
                          <input type="range" min="0" max="10" step="1" value={cfg.weight}
                            className="flex-1"
                            onChange={e => { const n=[...amDistConfigs]; const w=+e.target.value; n[i]={...n[i], weight:w, is_paused:w===0}; setAmDistConfigs(n) }} />
                          <span className="text-sm font-medium text-purple-600 w-4">{cfg.weight}</span>
                        </div>
                        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cfg.is_paused ? 'bg-red-300' : 'bg-purple-500'}`} style={{ width: `${cfg.is_paused ? 100 : share}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {!amDistConfigs.length && <div className="text-sm text-gray-400 col-span-2 py-4">No active AMs found.</div>}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium text-sm">Unassigned AM leads ({unassignedAm.length})</div>
                    <div className="text-xs text-gray-400 mt-0.5">AM Handling stage leads without an AM assigned</div>
                  </div>
                  <div className="flex gap-2">
                    {Object.keys(amAssignments).length > 0 && (
                      <button className="btn-success" onClick={confirmAmDistribution}>Confirm {Object.keys(amAssignments).length} assignments</button>
                    )}
                    <button
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                      onClick={distributeAllAm}
                      disabled={!unassignedAm.length || !amDistConfigs.some(c=>!c.is_paused)}>
                      Distribute all
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Client</th><th>City</th><th>BDO</th><th>Assigned AM</th></tr></thead>
                    <tbody>
                      {unassignedAm.map(l => (
                        <tr key={l.id}>
                          <td className="font-medium">{l.name}</td>
                          <td className="text-gray-500">{l.city||'—'}</td>
                          <td className="text-gray-500">{memberName(l.bdo_id)}</td>
                          <td>
                            {amAssignments[l.id]
                              ? <span className="text-purple-600 font-medium text-sm">{memberName(amAssignments[l.id])}</span>
                              : <select className="input py-1 text-xs" onChange={e => setAmAssignments(a=>({...a, [l.id]: e.target.value}))}>
                                  <option value="">— Assign manually —</option>
                                  {profiles.filter(p=>p.role==='am').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            }
                          </td>
                        </tr>
                      ))}
                      {!unassignedAm.length && <tr><td colSpan={4} className="text-center py-8 text-gray-400">All AM leads are assigned</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRADING COMMISSIONS ── */}
      {tab === 'trading_comm' && (
        <div>
          <div className="card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="font-medium text-sm">Month</div>
              <input type="month" className="input w-40" value={tcMonth} onChange={e => setTcMonth(e.target.value)} />
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mb-4">
              Enter total brokerage/trading commission generated by each analyst's client book this month. Analyst payout is calculated based on configured rates.
            </div>
            {analysts.map(analyst => {
              const myLeads = profiles ? [] : [] // fetched below
              return (
                <div key={analyst.id} className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{analyst.name}</div>
                    <button className="btn-success text-xs" onClick={() => approveTc(analyst.id)}>Approve payouts</button>
                  </div>
                  <AnalystTcEntry analyst={analyst} month={tcMonth} onSave={saveTcEntry} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AnalystTcEntry({ analyst, month, onSave }: { analyst: Profile; month: string; onSave: (aid: string, lid: string, val: number) => Promise<void> }) {
  const [clients, setClients] = useState<any[]>([])
  const [values, setValues] = useState<Record<string,string>>({})
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: leads } = await supabase.from('leads').select('id, name').eq('analyst_id', analyst.id)
      const { data: tc } = await supabase.from('trading_commissions').select('*').eq('analyst_id', analyst.id).eq('month', month)
      setClients(leads || [])
      const map: Record<string,string> = {}
      ;(tc || []).forEach((r: any) => { map[r.lead_id] = String(r.commission_generated) })
      setValues(map)
    }
    load()
  }, [analyst.id, month])

  const total = Object.values(values).reduce((s,v) => s + (parseFloat(v)||0), 0)

  return (
    <div className="border border-gray-100 rounded-xl p-3">
      {clients.map(c => (
        <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
          <span className="text-sm text-gray-600 flex-1">{c.name}</span>
          <input className="input w-36 py-1 text-right" type="number" placeholder="0" value={values[c.id]||''}
            onChange={e => setValues(v => ({...v, [c.id]: e.target.value}))}
            onBlur={e => onSave(analyst.id, c.id, parseFloat(e.target.value)||0)}
          />
          <span className="text-xs text-gray-400 w-8">PKR</span>
        </div>
      ))}
      {!clients.length && <div className="text-xs text-gray-400 py-2">No clients assigned</div>}
      {clients.length > 0 && (
        <div className="flex justify-between items-center pt-2 mt-1">
          <span className="text-xs text-gray-500">Total commission generated</span>
          <span className="font-medium text-sm text-teal-700">PKR {Math.round(total).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}
