'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lead, Profile, Deposit } from '@/types'
import { Plus, Search, X, Upload } from 'lucide-react'
import Papa from 'papaparse'

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
const AM_THRESHOLD = 1000000

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [bdoFilter, setBdoFilter] = useState('')
  const [amFilter, setAmFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadMode, setUploadMode] = useState(false)
  const [csvRows, setCsvRows] = useState<any[]>([])
  const supabase = createClient()

  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '', notes: '',
    bdo_id: '', am_id: '', analyst_id: '', stage: 'new', source: ''
  })
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [newDep, setNewDep] = useState({
    amount: '', date: new Date().toISOString().split('T')[0]
  })

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

  const bdos = profiles.filter(p => p.role === 'bdo')
  const ams = profiles.filter(p => p.role === 'am')
  const analysts = profiles.filter(p => p.role === 'trading')

  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter && l.stage !== stageFilter) return false
    if (bdoFilter && l.bdo_id !== bdoFilter) return false
    if (amFilter && l.am_id !== amFilter) return false
    return true
  })

  function openAdd() {
    setEditLead(null)
    setForm({
      name: '', phone: '', email: '', city: '', notes: '',
      bdo_id: myProfile?.role === 'bdo' ? myProfile.id : '',
      am_id: '', analyst_id: '', stage: 'new', source: ''
    })
    setDeposits([])
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
    setShowModal(true)
  }

  function openEdit(lead: Lead) {
    setEditLead(lead)
    setForm({
      name: lead.name, phone: lead.phone || '', email: lead.email || '',
      city: lead.city || '', notes: lead.notes || '',
      bdo_id: lead.bdo_id || '', am_id: lead.am_id || '',
      analyst_id: lead.analyst_id || '', stage: lead.stage, source: lead.source || ''
    })
    setDeposits(lead.deposits || [])
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
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
    const updated = [...deposits, dep]
    setDeposits(updated)
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
    const total = updated.reduce((s, d) => s + d.amount, 0)
    if (total >= AM_THRESHOLD && form.stage === 'account_opened') {
      setForm(f => ({ ...f, stage: 'am_handling' }))
      alert('Deposit >= PKR 1M - stage advanced to AM Handling. Please assign an AM.')
    }
  }

  async function saveLead() {
    if (!form.name.trim()) return alert('Client name required')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const leadData = {
        name: form.name, phone: form.phone || null, email: form.email || null,
        city: form.city || null, notes: form.notes || null,
        bdo_id: form.bdo_id || null, am_id: form.am_id || null,
        analyst_id: form.analyst_id || null, stage: form.stage,
        source: form.source || null, created_by: user!.id
      }

      let leadId = editLead?.id
      if (editLead) {
        await supabase.from('leads').update(leadData).eq('id', editLead.id)
      } else {
        const { data } = await supabase.from('leads').insert(leadData).select('id').single()
        leadId = data!.id
      }

      const newDeps = deposits.filter(d => d.id.startsWith('tmp_'))
      if (newDeps.length && leadId) {
        await supabase.from('deposits').insert(newDeps.map(d => ({
          lead_id: leadId!, amount: d.amount,
          deposit_date: d.deposit_date, created_by: user!.id
        })))
      }

      setShowModal(false)
      fetchData()
    } finally { setLoading(false) }
  }

  async function deleteLead() {
    if (!editLead || !confirm('Delete this lead?')) return
    await supabase.from('leads').delete().eq('id', editLead.id)
    setShowModal(false)
    fetchData()
  }

  function handleCsvUpload(file: File) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => { setCsvRows(results.data as any[]); setUploadMode(true) }
    })
  }

  async function importCsv() {
    if (!csvRows.length) return
    const { data: { user } } = await supabase.auth.getUser()
    const rows = csvRows.map((r: any) => ({
      name: r.client_name || r.name || '',
      phone: r.phone || null,
      email: null,
      city: r.city || null,
      notes: null,
      bdo_id: null,
      stage: 'new',
      source: 'CSV Upload',
      created_by: user!.id
    })).filter((r: any) => r.name)

    await supabase.from('leads').insert(rows)
    setCsvRows([])
    setUploadMode(false)
    fetchData()
    alert(`${rows.length} leads uploaded. Go to Admin > Lead Distribution to assign BDOs.`)
  }

  const memberName = (id: string | null) =>
    profiles.find(p => p.id === id)?.name ?? '-'

  const isAdmin = myProfile?.role === 'admin'
  const isAm = myProfile?.role === 'am'
  const isBdo = myProfile?.role === 'bdo'

  const hasActiveFilters = bdoFilter || amFilter || stageFilter || search

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">
          {isBdo ? 'My Leads' : isAm ? 'Team Leads' : 'All Leads'}
        </h1>
        <div className="flex gap-2">
          {(isAdmin || isAm) && (
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
              <Upload size={14} /> Upload CSV
              <input type="file" accept=".csv" className="hidden"
                onChange={e => e.target.files?.[0] && handleCsvUpload(e.target.files[0])} />
            </label>
          )}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
            onClick={openAdd}>
            <Plus size={14} /> Add Lead
          </button>
        </div>
      </div>

      {/* CSV Preview */}
      {uploadMode && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">{csvRows.length} rows detected</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {'All leads will be uploaded without a BDO - assign via Admin > Lead Distribution'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                onClick={() => { setCsvRows([]); setUploadMode(false) }}>
                Cancel
              </button>
              <button
                className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-xs font-medium hover:bg-green-800"
                onClick={importCsv}>
                Import {csvRows.filter((r: any) => r.client_name || r.name).length} valid rows
              </button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">#</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Name</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Phone</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">City</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Assignment</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 20).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className={`px-3 py-2 ${r.client_name || r.name ? 'font-medium' : 'text-red-500'}`}>
                      {r.client_name || r.name || 'Missing'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{r.phone || '-'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.city || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                        Pending distribution
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.client_name || r.name
                        ? <span className="text-green-600 text-xs">Valid</span>
                        : <span className="text-red-500 text-xs">Name missing</span>}
                    </td>
                  </tr>
                ))}
                {csvRows.length > 20 && (
                  <tr className="border-t border-gray-50">
                    <td colSpan={6} className="px-3 py-2 text-center text-xs text-gray-400">
                      ... and {csvRows.length - 20} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-36">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
            placeholder="Search client name..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
          value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
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
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50"
            onClick={() => { setSearch(''); setStageFilter(''); setBdoFilter(''); setAmFilter('') }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-400 mb-3">
        {filtered.length} lead{filtered.length !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '22%' }}>Client</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '13%' }}>Stage</th>
              {(isAdmin || isAm) && (
                <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '12%' }}>BDO</th>
              )}
              {isAdmin && (
                <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '12%' }}>AM</th>
              )}
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '14%' }}>Total Deposit</th>
              {isAdmin && (
                <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '11%' }}>Analyst</th>
              )}
              <th className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium" style={{ width: '10%' }}>Updated</th>
              <th style={{ width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id}
                className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                onClick={() => openEdit(lead)}>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-gray-400">{lead.city}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STAGE_CLASS[lead.stage]}`}>
                    {STAGES[lead.stage]}
                  </span>
                </td>
                {(isAdmin || isAm) && (
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{memberName(lead.bdo_id)}</td>
                )}
                {isAdmin && (
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{memberName(lead.am_id)}</td>
                )}
                <td className={`px-3 py-2.5 text-xs font-medium ${totalDeposit(lead) ? 'text-blue-600' : 'text-gray-400'}`}>
                  {totalDeposit(lead) ? PKR(totalDeposit(lead)) : '-'}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{memberName(lead.analyst_id)}</td>
                )}
                <td className="px-3 py-2.5 text-gray-400 text-xs">
                  {new Date(lead.updated_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-100"
                    onClick={e => { e.stopPropagation(); openEdit(lead) }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  No leads found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">
                {editLead ? `Edit - ${editLead.name}` : 'Add Lead'}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Client name *</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Phone</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Email</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">City</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {(isAdmin || isAm) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Assigned BDO</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    value={form.bdo_id} onChange={e => setForm(f => ({ ...f, bdo_id: e.target.value }))}>
                    <option value="">- Unassigned -</option>
                    {bdos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Stage</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                  {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {(form.stage === 'am_handling' || form.stage === 'trading') && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Assign AM</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    value={form.am_id} onChange={e => setForm(f => ({ ...f, am_id: e.target.value }))}>
                    <option value="">- None -</option>
                    {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {form.stage === 'trading' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Trading Analyst</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      value={form.analyst_id} onChange={e => setForm(f => ({ ...f, analyst_id: e.target.value }))}>
                      <option value="">- None -</option>
                      {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Source</label>
              <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Referral, website, cold call..."
                value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Notes</label>
              <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 min-h-16 resize-y"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* Deposits */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Deposits</div>
              {deposits.map((d, i) => (
                <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <span className="text-gray-500 text-xs">{d.deposit_date}</span>
                  <span className="font-medium text-blue-600 text-xs">{PKR(d.amount)}</span>
                  {d.id.startsWith('tmp_') && (
                    <button className="text-red-400 hover:text-red-600 text-xs ml-2"
                      onClick={() => setDeposits(deps => deps.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {deposits.length > 0 && (
                <div className="text-xs font-medium text-blue-600 mt-2">
                  Total: {PKR(deposits.reduce((s, d) => s + d.amount, 0))}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <input
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  type="number" placeholder="Amount (PKR)"
                  value={newDep.amount} onChange={e => setNewDep(d => ({ ...d, amount: e.target.value }))} />
                <input
                  className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  type="date" value={newDep.date}
                  onChange={e => setNewDep(d => ({ ...d, date: e.target.value }))} />
                <button
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                  onClick={addDeposit}>
                  Add
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              {editLead && (
                <button
                  className="px-3 py-1.5 border border-red-200 text-red-700 rounded-lg text-xs hover:bg-red-50"
                  onClick={deleteLead}>
                  Delete lead
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
                  onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                  onClick={saveLead} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
