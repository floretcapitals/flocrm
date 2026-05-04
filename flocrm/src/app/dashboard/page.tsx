import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PKR, totalDeposit, calcBdoCommission, calcAmCommission } from '@/lib/commission'
import type { Lead, Profile, CommissionSettings, BdoTier } from '@/types'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/auth/login')

  // Fetch leads visible to this user
  const { data: leads = [] } = await supabase
    .from('leads')
    .select('*, deposits(*)')
    .order('updated_at', { ascending: false })
    .limit(10)

  const { data: allLeads = [] } = await supabase.from('leads').select('*, deposits(*)')
  const { data: profiles = [] } = await supabase.from('profiles').select('*')
  const { data: settings } = await supabase.from('commission_settings').select('*').single()
  const { data: bdoTiers = [] } = await supabase.from('commission_bdo_tiers').select('*')

  const s = settings as CommissionSettings
  const p = profile as Profile
  const allP = (profiles || []) as Profile[]
  const allL = (allLeads || []) as Lead[]

  const totalDep = allL.reduce((sum, l) => sum + totalDeposit(l as Lead), 0)
  const openedAccounts = allL.filter(l => ['account_opened', 'am_handling', 'trading'].includes(l.stage)).length
  const inTrading = allL.filter(l => l.stage === 'trading').length
  const amPipeline = allL.filter(l => l.stage === 'am_handling').length

  // BDO-specific metrics
  let myComm = 0
  if (p.role === 'bdo' && s) {
    const result = calcBdoCommission(p, allL, s, (bdoTiers || []) as BdoTier[])
    myComm = result.total
  }

  const STAGE_LABEL: Record<string, string> = {
    new: 'New', contacted: 'Contacted', account_opened: 'Account Opened',
    am_handling: 'AM Handling', trading: 'Trading'
  }
  const STAGE_CLASS: Record<string, string> = {
    new: 'badge-new', contacted: 'badge-contacted', account_opened: 'badge-account_opened',
    am_handling: 'badge-am_handling', trading: 'badge-trading'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back, {p.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="metric-card">
          <div className="metric-label">Total leads</div>
          <div className="metric-value text-brand">{allL.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total deposits</div>
          <div className="metric-value text-green-700 text-base">{PKR(totalDep)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Accounts opened</div>
          <div className="metric-value">{openedAccounts}</div>
        </div>
        {p.role === 'bdo' ? (
          <div className="metric-card">
            <div className="metric-label">My commission</div>
            <div className="metric-value text-brand text-base">{PKR(myComm)}</div>
          </div>
        ) : (
          <div className="metric-card">
            <div className="metric-label">In trading</div>
            <div className="metric-value text-teal-700">{inTrading}</div>
          </div>
        )}
      </div>

      {/* Pipeline stage summary */}
      <div className="card mb-6">
        <div className="card-title">Pipeline overview</div>
        <div className="grid grid-cols-5 gap-2">
          {(['new','contacted','account_opened','am_handling','trading'] as const).map(stage => {
            const count = allL.filter(l => l.stage === stage).length
            const pct = allL.length ? Math.round(count / allL.length * 100) : 0
            return (
              <div key={stage} className="text-center">
                <div className="text-lg font-medium">{count}</div>
                <div className="text-xs text-gray-500 mt-0.5">{STAGE_LABEL[stage]}</div>
                <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent leads */}
      <div className="card">
        <div className="card-title">Recent leads</div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client</th><th>Stage</th><th>BDO</th><th>Deposit</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(leads as Lead[]).map(lead => {
                const bdo = allP.find(p => p.id === lead.bdo_id)
                const dep = totalDeposit(lead)
                return (
                  <tr key={lead.id}>
                    <td>
                      <div className="font-medium text-sm">{lead.name}</div>
                      <div className="text-xs text-gray-400">{lead.city}</div>
                    </td>
                    <td><span className={`badge ${STAGE_CLASS[lead.stage]}`}>{STAGE_LABEL[lead.stage]}</span></td>
                    <td className="text-gray-600">{bdo?.name ?? '—'}</td>
                    <td className={dep ? 'font-medium text-brand' : 'text-gray-400'}>{dep ? PKR(dep) : '—'}</td>
                    <td className="text-gray-400 text-xs">{new Date(lead.updated_at).toLocaleDateString()}</td>
                  </tr>
                )
              })}
              {!leads?.length && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No leads yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
