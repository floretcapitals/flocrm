'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PKR, totalDeposit } from '@/lib/commission'
import type { Lead, Profile, Deposit } from '@/types'
import { Plus, Search, X, Upload } from 'lucide-react'
import Papa from 'papaparse'

const STAGES = { new:'New', contacted:'Contacted', account_opened:'Account Opened', am_handling:'AM Handling', trading:'Trading' }
const STAGE_CLASS: Record<string,string> = { new:'badge-new', contacted:'badge-contacted', account_opened:'badge-account_opened', am_handling:'badge-am_handling', trading:'badge-trading' }
const AM_THRESHOLD = 1000000

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [bdoFilter, setBdoFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadMode, setUploadMode] = useState(false)
  const [csvRows, setCsvRows] = useState<any[]>([])
  const supabase = createClient()

  const [form, setForm] = useState({ name:'', phone:'', email:'', city:'', notes:'', bdo_id:'', am_id:'', analyst_id:'', stage:'new', source:'' })
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [newDep, setNewDep] = useState({ amount:'', date: new Date().toISOString().split('T')[0] })

  const fetchData = useCallback(async () => {
    const [{ data: l }, { data: p }, { data: me }] = await Promise.all([
      supabase.from('leads').select('*, deposits(*)').order('updated_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('is_active', true),
      supabase.from('profiles').select('*').eq('id', (await supabase.auth.getUser()).data.user!.id).single()
    ])
    setLeads((l || []) as Lead[])
    setProfiles((p || []) as Profile[])
    setMyProfile(me as Profile)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const bdos = profiles.filter(p => p.role === 'bdo')
  const ams = profiles.filter(p => p.role === 'am')
  const analysts = profiles.filter(p => p.role === 'trading')

  const filtered = leads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter && l.stage !== stageFilter) return false
    if (bdoFilter && l.bdo_id !== bdoFilter) return false
    return true
  })

  function openAdd() {
    setEditLead(null)
    setForm({ name:'', phone:'', email:'', city:'', notes:'', bdo_id: myProfile?.role === 'bdo' ? myProfile.id : '', am_id:'', analyst_id:'', stage:'new', source:'' })
    setDeposits([])
    setShowModal(true)
  }

  function openEdit(lead: Lead) {
    setEditLead(lead)
    setForm({ name: lead.name, phone: lead.phone||'', email: lead.email||'', city: lead.city||'', notes: lead.notes||'', bdo_id: lead.bdo_id||'', am_id: lead.am_id||'', analyst_id: lead.analyst_id||'', stage: lead.stage, source: lead.source||'' })
    setDeposits(lead.deposits || [])
    setShowModal(true)
  }

  function addDeposit() {
    if (!newDep.amount || !newDep.date) return
    const amt = parseFloat(newDep.amount)
    if (isNaN(amt) || amt <= 0) return
    const dep = { id: 'tmp_' + Date.now(), lead_id: editLead?.id || '', amount: amt, deposit_date: newDep.date, notes: null, created_at: new Date().toISOString() }
    const updated = [...deposits, dep]
    setDeposits(updated)
    setNewDep({ amount: '', date: new Date().toISOString().split('T')[0] })
    const total = updated.reduce((s, d) => s + d.amount, 0)
    if (total >= AM_THRESHOLD && form.stage === 'account_opened') {
      setForm(f => ({ ...f, stage: 'am_handling' }))
      alert('Deposit ≥ PKR 1M — stage advanced to AM Handling. Please assign an AM.')
    }
  }

  async function saveLead() {
    if (!form.name.trim()) return alert('Client name required')
    if (!form.bdo_id) return alert('Please assign a BDO')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const leadData = {
        name: form.name, phone: form.phone||null, email: form.email||null,
        city: form.city||null, notes: form.notes||null, bdo_id: form.bdo_id,
        am_id: form.am_id||null, analyst_id: form.analyst_id||null,
        stage: form.stage, source: form.source||null, created_by: user!.id
      }

      let leadId = editLead?.id
      if (editLead) {
        await supabase.from('leads').update(leadData).eq('id', editLead.id)
      } else {
        const { data } = await supabase.from('leads').insert(leadData).select('id').single()
        leadId = data!.id
      }

      // Save new deposits
      const newDeps = deposits.filter(d => d.id.startsWith('tmp_'))
      if (newDeps.length && leadId) {
        await supabase.from('deposits').insert(newDeps.map(d => ({
          lead_id: leadId!, amount: d.amount, deposit_date: d.deposit_date, created_by: user!.id
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
    const rows = csvRows.map(r => ({
      name: r.client_name || r.name || '',
      phone: r.phone || null, email: r.email || null,
      city: r.city || null, notes: r.notes || null,
      bdo_id: bdos.find(b => b.name.toLowerCase() === (r.bdo_name||'').toLowerCase())?.id || bdos[0]?.id || null,
      stage: r.stage || 'new', source: r.source || null, created_by: user!.id
    })).filter(r => r.name)
    await supabase.from('leads').insert(rows)
    setCsvRows([]); setUploadMode(false)
    fetchData()
    alert(`${rows.length} leads imported successfully`)
  }

  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Leads</h1>
        <div className="flex gap-2">
          <label className="btn-secondary cursor-pointer">
            <Upload size={14} /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleCsvUpload(e.target.files[0])} />
          </label>
          <button className="btn-primary" onClick={openAdd}><Plus size={14} /> Add Lead</button>
        </div>
      </div>

      {/* CSV Preview */}
      {uploadMode && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">{csvRows.length} rows detected from CSV</div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => { setCsvRows([]); setUploadMode(false) }}>Cancel</button>
              <button className="btn-success" onClick={importCsv}>Import all valid rows</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>City</th><th>BDO matched</th><th>Stage</th></tr></thead>
              <tbody>
                {csvRows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="text-gray-400">{i+1}</td>
                    <td className={r.client_name||r.name ? 'font-medium' : 'text-red-500'}>{r.client_name||r.name||'Missing'}</td>
                    <td>{r.phone||'—'}</td><td>{r.city||'—'}</td>
                    <td>{bdos.find(b=>b.name.toLowerCase()===(r.bdo_name||'').toLowerCase())?.name || <span className="text-amber-600">Default</span>}</td>
                    <td><span className={`badge ${STAGE_CLASS[r.stage]||'badge-new'}`}>{STAGES[r.stage as keyof typeof STAGES]||r.stage||'New'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-36">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input className="input pl-8" placeholder="Search client name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto" value={bdoFilter} onChange={e => setBdoFilter(e.target.value)}>
          <option value="">All BDOs</option>
          {bdos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client</th><th>Stage</th><th>BDO</th><th>Total Deposit</th><th>AM</th><th>Analyst</th><th>Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id} className="cursor-pointer" onClick={() => openEdit(lead)}>
                <td><div className="font-medium">{lead.name}</div><div className="text-xs text-gray-400">{lead.city}</div></td>
                <td><span className={`badge ${STAGE_CLASS[lead.stage]}`}>{STAGES[lead.stage]}</span></td>
                <td className="text-gray-600 text-xs">{memberName(lead.bdo_id)}</td>
                <td className={totalDeposit(lead) ? 'font-medium text-brand' : 'text-gray-400'}>{totalDeposit(lead) ? PKR(totalDeposit(lead)) : '—'}</td>
                <td className="text-gray-600 text-xs">{memberName(lead.am_id)}</td>
                <td className="text-gray-600 text-xs">{memberName(lead.analyst_id)}</td>
                <td className="text-gray-400 text-xs">{new Date(lead.updated_at).toLocaleDateString()}</td>
                <td><button className="btn-secondary text-xs" onClick={e => { e.stopPropagation(); openEdit(lead) }}>Edit</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No leads found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">{editLead ? `Edit — ${editLead.name}` : 'Add Lead'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="label">Client name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
              <div><label className="label">City</label><input className="input" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label">Assigned BDO *</label>
                <select className="input" value={form.bdo_id} onChange={e => setForm(f => ({...f, bdo_id: e.target.value}))}
                  disabled={myProfile?.role === 'bdo'}>
                  <option value="">— Select BDO —</option>
                  {bdos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Stage</label>
                <select className="input" value={form.stage} onChange={e => setForm(f => ({...f, stage: e.target.value}))}>
                  {Object.entries(STAGES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {(form.stage === 'am_handling' || form.stage === 'trading') && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="label">Assign AM</label>
                  <select className="input" value={form.am_id} onChange={e => setForm(f => ({...f, am_id: e.target.value}))}>
                    <option value="">— None —</option>
                    {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {form.stage === 'trading' && (
                  <div>
                    <label className="label">Trading Analyst</label>
                    <select className="input" value={form.analyst_id} onChange={e => setForm(f => ({...f, analyst_id: e.target.value}))}>
                      <option value="">— None —</option>
                      {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="mb-3">
              <label className="label">Source</label>
              <input className="input" placeholder="Referral, website, cold call…" value={form.source} onChange={e => setForm(f => ({...f, source: e.target.value}))} />
            </div>
            <div className="mb-4">
              <label className="label">Notes</label>
              <textarea className="input min-h-16 resize-y" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
            </div>

            {/* Deposits */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Deposits</div>
              {deposits.map((d, i) => (
                <div key={d.id} className="flex items-center justify-between py-1.5 text-sm border-b border-gray-50">
                  <span className="text-gray-500">{d.deposit_date}</span>
                  <span className="font-medium text-brand">{PKR(d.amount)}</span>
                  {d.id.startsWith('tmp_') && (
                    <button className="text-red-400 hover:text-red-600" onClick={() => setDeposits(deps => deps.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              {deposits.length > 0 && (
                <div className="text-sm font-medium text-brand mt-2">Total: {PKR(deposits.reduce((s,d) => s+d.amount, 0))}</div>
              )}
              <div className="flex gap-2 mt-2">
                <input className="input flex-1" type="number" placeholder="Amount (PKR)" value={newDep.amount} onChange={e => setNewDep(d => ({...d, amount: e.target.value}))} />
                <input className="input w-36" type="date" value={newDep.date} onChange={e => setNewDep(d => ({...d, date: e.target.value}))} />
                <button className="btn-secondary" onClick={addDeposit}>Add</button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              {editLead && <button className="btn-danger" onClick={deleteLead}>Delete lead</button>}
              <div className="flex gap-2 ml-auto">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={saveLead} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
