'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lead, TradingCommission, TRD } from '@/types'
import { X } from 'lucide-react'

const PKR = (n: number) => 'PKR ' + Math.round(n).toLocaleString()

export default function TradingPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [tc, setTc] = useState<TradingCommission[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [notes, setNotes] = useState('')
  const [commission, setCommission] = useState('')
  const [saving, setSaving] = useState(false)
  const [trd, setTrd] = useState<TRD | null>(null)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    setUserId(user.id)

    const [{ data: leadsData }, { data: tcData }] = await Promise.all([
      supabase.from('leads').select('*, deposits(*)').eq('analyst_id', user.id),
      supabase.from('trading_commissions').select('*').eq('analyst_id', user.id).eq('month', month),
    ])

    setLeads((leadsData || []) as Lead[])
    setTc((tcData || []) as TradingCommission[])
    setLoading(false)
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  async function openEdit(lead: Lead) {
    const entry = tc.find(t => t.lead_id === lead.id)
    setEditLead(lead)
    setNotes(lead.notes || '')
    setCommission(entry ? String(entry.commission_generated) : '')
    setTrd(null)
    const { data } = await supabase.from('trd').select('*').eq('lead_id', lead.id).maybeSingle()
    setTrd(data as TRD | null)
  }

  async function save() {
    if (!editLead) return
    setSaving(true)
    try {
      const { error: notesError } = await supabase.from('leads').update({ notes }).eq('id', editLead.id)
      if (notesError) { alert('Could not save notes: ' + notesError.message); return }

      const commValue = parseFloat(commission) || 0

      const { data: existing, error: fetchError } = await supabase
        .from('trading_commissions')
        .select('id, approved')
        .eq('lead_id', editLead.id)
        .eq('month', month)
        .maybeSingle()

      if (fetchError) { alert('Could not check commission: ' + fetchError.message); return }

      if (existing) {
        if (!existing.approved) {
          const { error } = await supabase.from('trading_commissions')
            .update({ commission_generated: commValue })
            .eq('id', existing.id)
          if (error) { alert('Could not update commission: ' + error.message); return }
        }
      } else {
        const { error } = await supabase.from('trading_commissions').insert({
          lead_id: editLead.id,
          analyst_id: userId,
          month,
          commission_generated: commValue,
        })
        if (error) { alert('Could not save commission: ' + error.message); return }
      }

      setEditLead(null)
      fetchData()
    } finally {
      setSaving(false)
    }
  }

  const totalComm = tc.reduce((s, t) => s + t.commission_generated, 0)
  const myPayout = tc.reduce((s, t) => s + (t.analyst_payout || 0), 0)
  const pendingCount = leads.filter(l => {
    const entry = tc.find(t => t.lead_id === l.id)
    return !entry || (!entry.approved && entry.commission_generated > 0)
  }).length

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>

  const activeEntry = editLead ? tc.find(t => t.lead_id === editLead.id) : null
  const isApproved = activeEntry?.approved ?? false

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">My Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} client{leads.length !== 1 ? 's' : ''} assigned to you</p>
        </div>
        <input type="month"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Active clients</div>
          <div className="text-xl font-medium text-teal-700">{leads.length}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Commission submitted</div>
          <div className="text-xl font-medium text-blue-600 text-base">{PKR(totalComm)}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">My payout</div>
          <div className="text-xl font-medium text-green-700 text-base">{PKR(myPayout)}</div>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {pendingCount} client{pendingCount !== 1 ? 's' : ''} have commission entries pending admin approval.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client list — {month}</span>
          <span className="text-xs text-gray-400">Click a row to add notes or submit commission</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Client</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Total deposit</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Commission submitted</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">My payout</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const dep = (lead.deposits || []).reduce((s, d) => s + d.amount, 0)
              const entry = tc.find(t => t.lead_id === lead.id)
              return (
                <tr key={lead.id}
                  className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                  onClick={() => openEdit(lead)}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-xs text-gray-400">{lead.phone || lead.city || '—'}</div>
                    {lead.notes && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-52 italic">{lead.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-blue-600">{dep ? PKR(dep) : '—'}</td>
                  <td className="px-4 py-2.5 text-teal-700 font-medium">
                    {entry ? PKR(entry.commission_generated) : <span className="text-xs text-gray-400">Not submitted</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {entry?.analyst_payout
                      ? <span className="font-medium text-green-700">{PKR(entry.analyst_payout)}</span>
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {!entry
                      ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No entry</span>
                      : entry.approved
                        ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Approved</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">Pending approval</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-100"
                      onClick={e => { e.stopPropagation(); openEdit(lead) }}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
            {!leads.length && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">No clients assigned yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editLead && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">{editLead.name}</h2>
              <button onClick={() => setEditLead(null)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-gray-50 rounded-xl text-sm">
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">Phone</span><div className="font-medium mt-0.5">{editLead.phone || '—'}</div></div>
              <div><span className="text-xs text-gray-400 uppercase tracking-wide">City</span><div className="font-medium mt-0.5">{editLead.city || '—'}</div></div>
            </div>

            {/* TRD Section — read-only for trading analysts */}
            <div className="border border-gray-100 rounded-xl p-4 mb-4 bg-gray-50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">Trading Reference Document</span>
                {trd
                  ? <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium">Filled</span>
                  : <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Not filled yet</span>
                }
              </div>
              {trd ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-xs text-gray-400">Account No.</span>
                    <div className="font-medium">{trd.account_number || '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">CDC Account</span>
                    <div className="font-medium">{trd.cdc_account || '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Account Type</span>
                    <div className="font-medium">{trd.account_type || '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Platform</span>
                    <div className="font-medium">{trd.platform || '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Risk Profile</span>
                    <div className="font-medium">{trd.risk_profile || '—'}</div>
                  </div>
                  {trd.notes && (
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">Notes</span>
                      <div className="font-medium">{trd.notes}</div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">TRD will be filled by the BDO or AM handling this client.</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Notes / Remarks</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500 min-h-24 resize-y"
                placeholder="Add notes or remarks about this client..."
                value={notes}
                onChange={e => setNotes(e.target.value)} />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Commission generated — {month} (PKR)
              </label>
              {isApproved ? (
                <div className="px-3 py-2.5 border border-green-200 bg-green-50 rounded-lg text-sm text-green-700 font-medium">
                  {PKR(parseFloat(commission) || 0)} — Approved by admin
                </div>
              ) : (
                <>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                    placeholder="Enter total commission generated this month"
                    value={commission}
                    onChange={e => setCommission(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Submitted to admin for approval. You cannot edit once approved.</p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
                onClick={() => setEditLead(null)}>
                Cancel
              </button>
              <button
                className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
                onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
