'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lead, Profile, Deposit, TRD } from '@/types'
import { Search, X } from 'lucide-react'

const PKR = (n: number) => 'PKR ' + Math.round(n).toLocaleString()
const totalDeposit = (lead: Lead) => (lead.deposits || []).reduce((s, d) => s + d.amount, 0)

const STAGES: Record<string, string> = {
  new: 'New', contacted: 'Contacted', account_opened: 'Account Opened',
  am_handling: 'AM Handling', trading: 'Trading'
}
const STAGE_CLASS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', contacted: 'bg-amber-50 text-amber-700',
  account_opened: 'bg-green-50 text-green-700', am_handling: 'bg-purple-50 text-purple-700',
  trading: 'bg-teal-50 text-teal-700'
}
const TRD_STAGES = ['account_opened', 'am_handling', 'trading']

export default function AmMyLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '', notes: '',
    bdo_id: '', am_id: '', analyst_id: '', stage: 'am_handling', source: ''
  })
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [newDep, setNewDep] = useState({ amount: '', date: new Date().toISOString().split('T')[0] })
  const [trd, setTrd] = useState<TRD | null>(null)
  const [trdForm, setTrdForm] = useState({
    account_number: '', cdc_account: '', account_type: '', platform: '', risk_profile: '', notes: ''
  })

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: me } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMyProfile(me as Profile)

    if (me?.role !== 'am') { window.location.href = '/dashboard'; return }

    const { data: p } = await supabase.from('profiles').select('*').eq('is_active', true)
    setProfiles((p || []) as Profile[])

    const { data: l } = await supabase
      .from('leads').select('*, deposits(*)')
      .eq('am_id', user.id).order('updated_at', { ascending: false })

    setLeads((l || []) as Lead[])
  }, [])

  useEffect(() => { fetchData() }, [fetchData])


  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter && l.stage !== stageFilter) return false
    if (monthFilter && !l.updated_at.startsWith(monthFilter)) return false
    return true
  })

  async function openEdit(lead: Lead) {
    setEditLead(lead)
    setForm({
      name: lead.name, phone: lead.phone || '', email: lead.email || '',
      city: lead.city || '', notes: lead.notes || '',
      bdo_id: lead.bdo_id || '', am_id: lead.am_id || '',
      analyst_id: lead.analyst_id || '', stage: lead.stage, source: lead.source || ''
    })
    setDeposits(lead.deposits || [])
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
    setTrd(null)
    setTrdForm({ account_number: '', cdc_account: '', account_type: '', platform: '', risk_profile: '', notes: '' })
    const { data } = await supabase.from('trd').select('*').eq('lead_id', lead.id).maybeSingle()
    setTrd(data as TRD | null)
    if (data) {
      setTrdForm({
        account_number: data.account_number || '',
        cdc_account: data.cdc_account || '',
        account_type: data.account_type || '',
        platform: data.platform || '',
        risk_profile: data.risk_profile || '',
        notes: data.notes || '',
      })
    }
    setShowModal(true)
  }

  function addDeposit() {
    if (!newDep.amount || !newDep.date) return
    const amt = parseFloat(newDep.amount)
    if (isNaN(amt) || amt <= 0) return
    const dep: Deposit = {
      id: 'tmp_' + Date.now(), lead_id: editLead?.id || '',
      amount: amt, deposit_date: newDep.date, notes: null,
      created_at: new Date().toISOString()
    }
    setDeposits(prev => [...prev, dep])
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
  }

  async function saveLead() {
    if (!editLead) return
    if (TRD_STAGES.includes(form.stage) && !trd && !trdForm.account_number.trim()) {
      return alert('TRD is required: please fill in the Account Number before saving.')
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('leads').update({
        notes: form.notes, stage: form.stage,
        analyst_id: form.analyst_id || null,
      }).eq('id', editLead.id)

      const newDeps = deposits.filter(d => d.id.startsWith('tmp_'))
      if (newDeps.length) {
        await supabase.from('deposits').insert(newDeps.map(d => ({
          lead_id: editLead.id, amount: d.amount,
          deposit_date: d.deposit_date, created_by: user!.id
        })))
      }

      if (TRD_STAGES.includes(form.stage) && trdForm.account_number.trim()) {
        const canWrite = !trd || trd.created_by === user!.id
        if (canWrite) {
          const trdData = {
            account_number: trdForm.account_number || null,
            cdc_account: trdForm.cdc_account || null,
            account_type: trdForm.account_type || null,
            platform: trdForm.platform || null,
            risk_profile: trdForm.risk_profile || null,
            notes: trdForm.notes || null,
            updated_at: new Date().toISOString(),
          }
          let trdError
          if (trd?.id) {
            const { error } = await supabase.from('trd').update(trdData).eq('id', trd.id)
            trdError = error
          } else {
            const { error } = await supabase.from('trd').insert({ ...trdData, lead_id: editLead.id, created_by: user!.id })
            trdError = error
          }
          if (trdError) {
            alert('Lead saved, but TRD could not be saved: ' + trdError.message)
            return
          }
        }
      }

      setShowModal(false)
      fetchData()
    } finally { setLoading(false) }
  }

  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '—'
  const analysts = profiles.filter(p => p.role === 'trading')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">My Leads</h1>
          <p className="text-xs text-gray-400 mt-0.5">Leads directly assigned to you</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-36">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500"
            placeholder="Search client name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input type="month" className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500"
          value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
        <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
          value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(search || stageFilter || monthFilter) && (
          <button className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50"
            onClick={() => { setSearch(''); setStageFilter(''); setMonthFilter('') }}>Clear</button>
        )}
      </div>

      <div className="text-xs text-gray-400 mb-3">{filtered.length} lead{filtered.length !== 1 ? 's' : ''} assigned to you</div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '25%' }}>Client</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '14%' }}>Stage</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '10%' }}>TRD</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '13%' }}>BDO</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '14%' }}>Total Deposit</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '12%' }}>Analyst</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '8%' }}>Updated</th>
              <th style={{ width: '4%' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id} className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer" onClick={() => openEdit(lead)}>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-gray-400">{lead.phone || lead.city || '—'}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STAGE_CLASS[lead.stage]}`}>{STAGES[lead.stage]}</span>
                </td>
                <td className="px-3 py-2.5">
                  {TRD_STAGES.includes(lead.stage) && (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{memberName(lead.bdo_id)}</td>
                <td className={`px-3 py-2.5 text-xs font-medium ${totalDeposit(lead) ? 'text-blue-600' : 'text-gray-400'}`}>
                  {totalDeposit(lead) ? PKR(totalDeposit(lead)) : '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{memberName(lead.analyst_id)}</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">{new Date(lead.updated_at).toLocaleDateString()}</td>
                <td className="px-3 py-2.5">
                  <button className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-100"
                    onClick={e => { e.stopPropagation(); openEdit(lead) }}>Edit</button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                {leads.length === 0 ? 'No leads assigned to you yet' : 'No leads match your filters'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showModal && editLead && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">{editLead.name}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-gray-50 rounded-xl text-sm">
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">Phone</span><div className="font-medium mt-0.5">{editLead.phone || '—'}</div></div>
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">City</span><div className="font-medium mt-0.5">{editLead.city || '—'}</div></div>
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">Source</span><div className="font-medium mt-0.5">{editLead.source || '—'}</div></div>
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">BDO</span><div className="font-medium mt-0.5">{memberName(editLead.bdo_id)}</div></div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Stage</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                  {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {form.stage === 'trading' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Trading Analyst</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                    value={form.analyst_id} onChange={e => setForm(f => ({ ...f, analyst_id: e.target.value }))}>
                    <option value="">— None —</option>
                    {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
              <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 min-h-16 resize-y"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* TRD Section */}
            {TRD_STAGES.includes(form.stage) && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-700 uppercase tracking-wide">Trading Reference Document (TRD)</div>
                    {!trd && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">Required</span>}
                    {trd && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium">Filled</span>}
                  </div>
                  {trd && trd.created_by !== myProfile?.id && (
                    <span className="text-xs text-gray-400">Created by {memberName(trd.created_by)}</span>
                  )}
                </div>
                {trd && trd.created_by !== myProfile?.id ? (
                  <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {trd.account_number && <div><span className="text-xs text-gray-400">Account No.</span><div className="font-medium">{trd.account_number}</div></div>}
                    {trd.cdc_account && <div><span className="text-xs text-gray-400">CDC Account</span><div className="font-medium">{trd.cdc_account}</div></div>}
                    {trd.account_type && <div><span className="text-xs text-gray-400">Type</span><div className="font-medium">{trd.account_type}</div></div>}
                    {trd.platform && <div><span className="text-xs text-gray-400">Platform</span><div className="font-medium">{trd.platform}</div></div>}
                    {trd.risk_profile && <div><span className="text-xs text-gray-400">Risk Profile</span><div className="font-medium">{trd.risk_profile}</div></div>}
                    {trd.notes && <div className="col-span-2"><span className="text-xs text-gray-400">TRD Notes</span><div className="font-medium">{trd.notes}</div></div>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Account Number *</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        placeholder="Broker account number"
                        value={trdForm.account_number} onChange={e => setTrdForm(f => ({ ...f, account_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">CDC Account Number</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        placeholder="CDC / investor account"
                        value={trdForm.cdc_account} onChange={e => setTrdForm(f => ({ ...f, cdc_account: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Account Type</label>
                      <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        value={trdForm.account_type} onChange={e => setTrdForm(f => ({ ...f, account_type: e.target.value }))}>
                        <option value="">Select type</option>
                        <option>Individual</option><option>Joint</option><option>Corporate</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Trading Platform</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        placeholder="e.g. PSX, MT5"
                        value={trdForm.platform} onChange={e => setTrdForm(f => ({ ...f, platform: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Risk Profile</label>
                      <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        value={trdForm.risk_profile} onChange={e => setTrdForm(f => ({ ...f, risk_profile: e.target.value }))}>
                        <option value="">Select profile</option>
                        <option>Conservative</option><option>Moderate</option><option>Aggressive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">TRD Notes</label>
                      <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                        placeholder="Additional remarks"
                        value={trdForm.notes} onChange={e => setTrdForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deposits */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Deposits</div>
              {deposits.map((d, i) => (
                <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <span className="text-gray-500 text-xs">{d.deposit_date}</span>
                  <span className="font-medium text-blue-600 text-xs">{PKR(d.amount)}</span>
                  {d.id.startsWith('tmp_') && (
                    <button className="text-red-400 hover:text-red-600 text-xs ml-2"
                      onClick={() => setDeposits(deps => deps.filter((_, j) => j !== i))}>Remove</button>
                  )}
                </div>
              ))}
              {deposits.length > 0 && (
                <div className="text-xs font-medium text-blue-600 mt-2">Total: {PKR(deposits.reduce((s, d) => s + d.amount, 0))}</div>
              )}
              <div className="flex gap-2 mt-3">
                <input className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  type="number" placeholder="Amount (PKR)" value={newDep.amount} onChange={e => setNewDep(d => ({ ...d, amount: e.target.value }))} />
                <input className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  type="date" value={newDep.date} onChange={e => setNewDep(d => ({ ...d, date: e.target.value }))} />
                <button className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50" onClick={addDeposit}>Add</button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
                onClick={saveLead} disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
