import { createClient } from '@/lib/supabase/server'
import { PKR } from '@/lib/commission'
import type { Lead, TradingCommission } from '@/types'

export default async function TradingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const month = new Date().toISOString().slice(0, 7)

  const [{ data: leads }, { data: tc }] = await Promise.all([
    supabase.from('leads').select('*, deposits(*)').eq('analyst_id', user.id).eq('stage', 'trading'),
    supabase.from('trading_commissions').select('*').eq('analyst_id', user.id).eq('month', month)
  ])

  const myLeads = (leads || []) as Lead[]
  const myTc = (tc || []) as TradingCommission[]

  const totalComm = myTc.reduce((s, t) => s + t.commission_generated, 0)
  const myPayout = myTc.reduce((s, t) => s + (t.analyst_payout || 0), 0)

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-medium">My Clients</h1><p className="text-sm text-gray-500 mt-0.5">{myLeads.length} clients assigned to you</p></div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="metric-card"><div className="metric-label">Active clients</div><div className="metric-value text-teal-700">{myLeads.length}</div></div>
        <div className="metric-card"><div className="metric-label">Commission this month</div><div className="metric-value text-brand text-base">{PKR(totalComm)}</div></div>
        <div className="metric-card"><div className="metric-label">My payout</div><div className="metric-value text-green-700 text-base">{PKR(myPayout)}</div></div>
      </div>

      <div className="card">
        <div className="card-title">Client list — {month}</div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Client</th><th>City</th><th>Total deposit</th><th>Commission this month</th><th>My share</th></tr></thead>
            <tbody>
              {myLeads.map(lead => {
                const dep = (lead.deposits || []).reduce((s, d) => s + d.amount, 0)
                const commEntry = myTc.find(t => t.lead_id === lead.id)
                return (
                  <tr key={lead.id}>
                    <td><div className="font-medium">{lead.name}</div><div className="text-xs text-gray-400">{lead.phone}</div></td>
                    <td className="text-gray-500">{lead.city || '—'}</td>
                    <td className="font-medium text-brand">{dep ? PKR(dep) : '—'}</td>
                    <td className="text-teal-700 font-medium">{commEntry ? PKR(commEntry.commission_generated) : '—'}</td>
                    <td>{commEntry?.analyst_payout ? PKR(commEntry.analyst_payout) : <span className="text-xs text-gray-400">Pending</span>}</td>
                  </tr>
                )
              })}
              {!myLeads.length && <tr><td colSpan={5} className="text-center py-10 text-gray-400">No clients assigned yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
