'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Lead, TradingCommission } from '@/types'

const PKR = (n: number) => 'PKR ' + Math.round(n).toLocaleString()

export default function TradingPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [tc, setTc] = useState<TradingCommission[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: leadsData }, { data: tcData }] = await Promise.all([
      supabase.from('leads').select('*, deposits(*)').eq('analyst_id', user.id),
      supabase.from('trading_commissions').select('*').eq('analyst_id', user.id).eq('month', month),
    ])

    setLeads((leadsData || []) as Lead[])
    setTc((tcData || []) as TradingCommission[])
    setLoading(false)
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  const totalComm = tc.reduce((s, t) => s + t.commission_generated, 0)
  const myPayout = tc.reduce((s, t) => s + (t.analyst_payout || 0), 0)

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">My Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} client{leads.length !== 1 ? 's' : ''} assigned to you</p>
        </div>
        <input
          type="month"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Active clients</div>
          <div className="text-xl font-medium text-teal-700">{leads.length}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Commission this month</div>
          <div className="text-xl font-medium text-blue-600 text-base">{PKR(totalComm)}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">My payout</div>
          <div className="text-xl font-medium text-green-700 text-base">{PKR(myPayout)}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
          Client list — {month}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Client</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">City</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Total deposit</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Commission this month</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">My share</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const dep = (lead.deposits || []).reduce((s, d) => s + d.amount, 0)
              const commEntry = tc.find(t => t.lead_id === lead.id)
              return (
                <tr key={lead.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-xs text-gray-400">{lead.phone}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{lead.city || '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-blue-600">{dep ? PKR(dep) : '—'}</td>
                  <td className="px-4 py-2.5 text-teal-700 font-medium">{commEntry ? PKR(commEntry.commission_generated) : '—'}</td>
                  <td className="px-4 py-2.5">
                    {commEntry?.analyst_payout
                      ? <span className="font-medium text-green-700">{PKR(commEntry.analyst_payout)}</span>
                      : <span className="text-xs text-gray-400">Pending</span>}
                  </td>
                </tr>
              )
            })}
            {!leads.length && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">No clients assigned yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
