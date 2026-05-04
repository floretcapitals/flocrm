import { createClient } from '@/lib/supabase/server'
import { PKR, totalDeposit, calcBdoCommission, calcAmCommission, calcAnalystCommission } from '@/lib/commission'
import type { Lead, Profile, CommissionSettings, BdoTier, AmTier, TaTier, TradingCommission } from '@/types'

export default async function CommissionPage() {
  const supabase = createClient()
  const [{ data: leads }, { data: profiles }, { data: settings }, { data: bdoTiers }, { data: amTiers }, { data: taTiers }, { data: tc }] = await Promise.all([
    supabase.from('leads').select('*, deposits(*)'),
    supabase.from('profiles').select('*').eq('is_active', true),
    supabase.from('commission_settings').select('*').single(),
    supabase.from('commission_bdo_tiers').select('*').order('sort_order'),
    supabase.from('commission_am_tiers').select('*'),
    supabase.from('commission_ta_tiers').select('*').order('min_commission'),
    supabase.from('trading_commissions').select('*'),
  ])

  const s = settings as CommissionSettings
  const allLeads = (leads || []) as Lead[]
  const allProfiles = (profiles || []) as Profile[]
  const allTc = (tc || []) as TradingCommission[]

  const bdos = allProfiles.filter(p => p.role === 'bdo')
  const ams = allProfiles.filter(p => p.role === 'am')
  const analysts = allProfiles.filter(p => p.role === 'trading')

  const bdoResults = bdos.map(b => calcBdoCommission(b, allLeads, s, (bdoTiers||[]) as BdoTier[]))
  const amResults = ams.map(a => calcAmCommission(a, allLeads, allProfiles, s, (amTiers||[]) as AmTier[]))
  const analystResults = analysts.map(a => calcAnalystCommission(a, allTc, s, (taTiers||[]) as TaTier[]))

  const totalBdoPayout = bdoResults.reduce((s, r) => s + r.total, 0)
  const totalAmPayout = amResults.reduce((s, r) => s + r.commission + r.bonus, 0)
  const totalAnalystPayout = analystResults.reduce((s, r) => s + r.payout, 0)

  function initials(name: string) { return name.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() }

  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-medium">Commission</h1><p className="text-sm text-gray-500 mt-0.5">Current month calculations</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="metric-card"><div className="metric-label">BDO total payout</div><div className="metric-value text-brand text-base">{PKR(totalBdoPayout)}</div></div>
        <div className="metric-card"><div className="metric-label">AM total payout</div><div className="metric-value text-purple-700 text-base">{PKR(totalAmPayout)}</div></div>
        <div className="metric-card"><div className="metric-label">Analyst payout</div><div className="metric-value text-teal-700 text-base">{PKR(totalAnalystPayout)}</div></div>
        <div className="metric-card"><div className="metric-label">Total commission</div><div className="metric-value text-base">{PKR(totalBdoPayout + totalAmPayout + totalAnalystPayout)}</div></div>
      </div>

      {/* BDO Table */}
      <div className="card mb-4">
        <div className="card-title">BDO commissions</div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>BDO</th><th>Accounts</th><th>Acct bonus</th><th>Total deposits</th><th>Dep commission</th><th>AM share</th><th>Total payout</th></tr></thead>
            <tbody>
              {bdoResults.map(r => (
                <tr key={r.bdo.id}>
                  <td><div className="font-medium">{r.bdo.name}</div></td>
                  <td>{r.accounts} {r.accounts > (s?.bdo_acct_min_threshold||30) ? <span className="badge badge-account_opened ml-1">Eligible</span> : ''}</td>
                  <td className={r.acct_commission ? 'text-green-700 font-medium' : 'text-gray-400'}>{r.acct_commission ? PKR(r.acct_commission) : '—'}</td>
                  <td>{PKR(r.total_deposit)}</td>
                  <td className={r.dep_commission ? 'text-brand font-medium' : 'text-gray-400'}>{r.dep_commission ? PKR(r.dep_commission) : <span className="text-xs">{PKR(r.total_deposit)} / {PKR(s?.bdo_dep_threshold||2200000)} threshold</span>}</td>
                  <td>{r.am_share ? PKR(r.am_share) : '—'}</td>
                  <td className="font-medium text-brand">{PKR(r.total)}</td>
                </tr>
              ))}
              {!bdoResults.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No BDOs found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* AM Table */}
      <div className="card mb-4">
        <div className="card-title">Assistant Manager commissions</div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>AM</th><th>BDOs</th><th>Target</th><th>Achieved</th><th>Total deposits</th><th>Commission</th><th>Bonus</th></tr></thead>
            <tbody>
              {amResults.map(r => {
                const pct = r.target > 0 ? Math.round(r.achieved / r.target * 100) : 0
                return (
                  <tr key={r.am.id}>
                    <td><div className="font-medium">{r.am.name}</div></td>
                    <td>{r.bdo_count}</td>
                    <td>{r.target} clients ≥1M</td>
                    <td>
                      <div>{r.achieved}/{r.target}</div>
                      <div className="mt-1 h-1 w-20 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100,pct)}%` }} />
                      </div>
                    </td>
                    <td>{PKR(r.total_deposit)}</td>
                    <td className="font-medium text-purple-700">{PKR(r.commission)}</td>
                    <td>{r.bonus ? PKR(r.bonus) : '—'}</td>
                  </tr>
                )
              })}
              {!amResults.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No AMs found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analyst Table */}
      <div className="card">
        <div className="card-title">Trading analyst commissions</div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Analyst</th><th>Clients</th><th>Comm generated</th><th>Rate</th><th>Analyst payout</th><th>Firm retains</th><th>Status</th></tr></thead>
            <tbody>
              {analystResults.map(r => (
                <tr key={r.analyst.id}>
                  <td><div className="font-medium">{r.analyst.name}</div></td>
                  <td>{r.client_count}</td>
                  <td className="font-medium text-teal-700">{PKR(r.total_commission_generated)}</td>
                  <td>{r.payout_rate}%</td>
                  <td className="font-medium text-brand">{PKR(r.payout)}</td>
                  <td className="text-gray-500">{PKR(r.total_commission_generated - r.payout)}</td>
                  <td><span className={`badge ${r.approved ? 'badge-account_opened' : 'badge-contacted'}`}>{r.approved ? 'Approved' : 'Pending'}</span></td>
                </tr>
              ))}
              {!analystResults.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No analysts found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
