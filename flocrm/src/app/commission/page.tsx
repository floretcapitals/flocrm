'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PKR = (n: number) => 'PKR ' + Math.round(n).toLocaleString()

export default function CommissionPage() {
  const [myProfile, setMyProfile] = useState<any>(null)
  const [data, setData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setMyProfile(profile)

      const { data: settings } = await supabase
        .from('commission_settings').select('*').single()
      const { data: bdoTiers } = await supabase
        .from('commission_bdo_tiers').select('*').order('sort_order')
      const { data: amTiers } = await supabase
        .from('commission_am_tiers').select('*')
      const { data: taTiers } = await supabase
        .from('commission_ta_tiers').select('*')
      const { data: allLeads } = await supabase
        .from('leads').select('*, deposits(*)')
      const { data: allProfiles } = await supabase
        .from('profiles').select('*').eq('is_active', true)
      const { data: tc } = await supabase
        .from('trading_commissions').select('*').eq('month', month)

      setData({ settings, bdoTiers, amTiers, taTiers, allLeads, allProfiles, tc })
      setLoading(false)
    }
    load()
  }, [month])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
  )

  const { settings: s, bdoTiers, amTiers, taTiers, allLeads, allProfiles, tc } = data
  if (!s || !allLeads || !allProfiles) return null

  const role = myProfile?.role
  const myId = myProfile?.id

  function totalDep(lead: any) {
    return (lead.deposits || [])
      .filter((d: any) => d.deposit_date.startsWith(month))
      .reduce((sum: number, d: any) => sum + d.amount, 0)
  }

  function bdoDepRate(totalDepAmt: number) {
    if (totalDepAmt < s.bdo_dep_threshold) return 0
    const sorted = [...(bdoTiers || [])].sort((a: any, b: any) => b.from_amount - a.from_amount)
    for (const t of sorted) {
      if (totalDepAmt >= t.from_amount) return t.commission_pct
    }
    return s.bdo_dep_commission_pct
  }

  function calcBdo(bdoId: string) {
    const leads = allLeads.filter((l: any) => l.bdo_id === bdoId)
    const accountLeads = leads.filter((l: any) =>
      ['account_opened', 'am_handling', 'trading'].includes(l.stage))
    const accounts = accountLeads.length
    const acctComm = accounts > s.bdo_acct_min_threshold
      ? accounts * s.bdo_acct_bonus_per_account : 0
    const dep = leads.reduce((sum: number, l: any) => sum + totalDep(l), 0)
    const depRate = bdoDepRate(dep)
    const depComm = dep * depRate / 100
    const amLeads = leads.filter((l: any) => l.am_id)
    const amDep = amLeads.reduce((sum: number, l: any) => sum + totalDep(l), 0)
    const amShare = amDep * s.bdo_am_share_pct / 100
    return { accounts, acctComm, dep, depComm, amShare, total: acctComm + depComm + amShare, depRate }
  }

  function calcAm(amId: string) {
    const myBdos = allProfiles.filter((p: any) => p.role === 'bdo' && p.reports_to === amId)
    const target = myBdos.length * s.am_target_per_bdo
    const amLeads = allLeads.filter((l: any) =>
      l.am_id === amId && totalDep(l) >= s.am_min_dep_qualify)
    const achieved = amLeads.length
    const dep = amLeads.reduce((sum: number, l: any) => sum + totalDep(l), 0)
    const commission = dep * s.am_dep_commission_pct / 100
    const achievePct = target > 0 ? (achieved / target) * 100 : 0
    const sorted = [...(amTiers || [])].sort((a: any, b: any) => b.achieve_pct - a.achieve_pct)
    let bonus = 0
    for (const t of sorted) { if (achievePct >= t.achieve_pct) { bonus = t.bonus_amount; break } }
    return { myBdos: myBdos.length, target, achieved, dep, commission, bonus, achievePct }
  }

  function calcAnalyst(analystId: string) {
    const myTc = (tc || []).filter((t: any) => t.analyst_id === analystId)
    const totalGen = myTc.reduce((sum: number, t: any) => sum + t.commission_generated, 0)
    const sorted = [...(taTiers || [])].sort((a: any, b: any) => b.min_commission - a.min_commission)
    let rate = s.ta_payout_pct
    for (const t of sorted) { if (totalGen >= t.min_commission) { rate = t.payout_pct; break } }
    const payout = totalGen < s.ta_min_comm_qualify ? 0 : totalGen * rate / 100
    const approved = myTc.every((t: any) => t.approved) && myTc.length > 0
    return { totalGen, rate, payout, approved, clientCount: new Set(myTc.map((t: any) => t.lead_id)).size }
  }

  // ── BDO VIEW ──────────────────────────────────────────────────────
  if (role === 'bdo') {
    const r = calcBdo(myId)
    const pct = Math.min(100, r.dep / (s.bdo_dep_threshold || 1) * 100)
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium">My Commission</h1>
            <p className="text-sm text-gray-400 mt-0.5">{myProfile.name}</p>
          </div>
          <input type="month" className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
            value={month} onChange={e => { setMonth(e.target.value); setLoading(true) }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total payout</div>
            <div className="text-xl font-medium text-blue-600">{PKR(r.total)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Accounts opened</div>
            <div className="text-xl font-medium">{r.accounts}</div>
            <div className="text-xs text-gray-400 mt-0.5">Min {s.bdo_acct_min_threshold} to earn bonus</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total deposits</div>
            <div className="text-xl font-medium text-green-700 text-base">{PKR(r.dep)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">AM client share</div>
            <div className="text-xl font-medium">{PKR(r.amShare)}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="text-sm font-medium mb-4">Commission breakdown</div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <div>
                <div className="text-sm">Account bonus</div>
                <div className="text-xs text-gray-400">PKR {s.bdo_acct_bonus_per_account} × {r.accounts} accounts {r.accounts <= s.bdo_acct_min_threshold ? `(need >${s.bdo_acct_min_threshold})` : ''}</div>
              </div>
              <div className="font-medium text-sm">{PKR(r.acctComm)}</div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <div>
                <div className="text-sm">Deposit commission</div>
                <div className="text-xs text-gray-400">{r.depRate}% on {PKR(r.dep)}</div>
                <div className="mt-1.5 h-1.5 w-48 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {pct >= 100 ? '✓ Threshold met' : `${PKR(s.bdo_dep_threshold - r.dep)} to unlock`}
                </div>
              </div>
              <div className="font-medium text-sm">{PKR(r.depComm)}</div>
            </div>
            <div className="flex justify-between items-center py-2">
              <div>
                <div className="text-sm">AM client share ({s.bdo_am_share_pct}%)</div>
                <div className="text-xs text-gray-400">On deposits of clients moved to AM</div>
              </div>
              <div className="font-medium text-sm">{PKR(r.amShare)}</div>
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-200">
            <div className="font-medium">Total payout</div>
            <div className="text-lg font-medium text-blue-600">{PKR(r.total)}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── TRADING ANALYST VIEW ──────────────────────────────────────────
  if (role === 'trading') {
    const r = calcAnalyst(myId)
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium">My Commission</h1>
            <p className="text-sm text-gray-400 mt-0.5">{myProfile.name}</p>
          </div>
          <input type="month" className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
            value={month} onChange={e => { setMonth(e.target.value); setLoading(true) }} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Commission generated</div>
            <div className="text-xl font-medium text-teal-700 text-base">{PKR(r.totalGen)}</div>
            <div className="text-xs text-gray-400 mt-0.5">By your {r.clientCount} clients</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Your payout rate</div>
            <div className="text-xl font-medium">{r.rate}%</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Your payout</div>
            <div className="text-xl font-medium text-blue-600 text-base">{PKR(r.payout)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{r.approved ? '✓ Approved' : 'Pending approval'}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-sm font-medium mb-3">How it's calculated</div>
          <div className="text-sm text-gray-600 space-y-2">
            <div className="flex justify-between py-2 border-b border-gray-50">
              <span>Total trading commission generated</span>
              <span className="font-medium">{PKR(r.totalGen)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-50">
              <span>Your payout rate</span>
              <span className="font-medium">{r.rate}%</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-50">
              <span>Firm retains</span>
              <span className="font-medium">{PKR(r.totalGen - r.payout)}</span>
            </div>
            <div className="flex justify-between py-2 font-medium text-blue-600">
              <span>Your payout</span>
              <span>{PKR(r.payout)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── AM VIEW ───────────────────────────────────────────────────────
  if (role === 'am') {
    const myBdoList = allProfiles.filter((p: any) => p.role === 'bdo' && p.reports_to === myId)
    const amResult = calcAm(myId)
    const pct = Math.min(100, amResult.achievePct)
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium">Team Commission</h1>
            <p className="text-sm text-gray-400 mt-0.5">{myProfile.name} — {myBdoList.length} BDOs</p>
          </div>
          <input type="month" className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
            value={month} onChange={e => { setMonth(e.target.value); setLoading(true) }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">My commission</div>
            <div className="text-xl font-medium text-purple-700 text-base">{PKR(amResult.commission + amResult.bonus)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Target</div>
            <div className="text-xl font-medium">{amResult.achieved}/{amResult.target}</div>
            <div className="text-xs text-gray-400 mt-0.5">clients ≥ {PKR(s.am_min_dep_qualify)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total deposits</div>
            <div className="text-xl font-medium text-green-700 text-base">{PKR(amResult.dep)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Performance bonus</div>
            <div className="text-xl font-medium">{PKR(amResult.bonus)}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="text-sm font-medium mb-3">My target progress</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">{amResult.achieved} of {amResult.target} qualifying clients</span>
            <span className="text-sm font-medium">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-purple-400'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-sm py-2 border-t border-gray-50">
            <span className="text-gray-500">{s.am_dep_commission_pct}% on qualifying deposits</span>
            <span className="font-medium">{PKR(amResult.commission)}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-t border-gray-50">
            <span className="text-gray-500">Performance bonus</span>
            <span className="font-medium">{PKR(amResult.bonus)}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-t border-gray-200 font-medium text-purple-700">
            <span>Total payout</span>
            <span>{PKR(amResult.commission + amResult.bonus)}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
            My BDOs commission
          </div>
          <table className="w-full text-sm">
            <thead><tr>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">BDO</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Accounts</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Deposits</th>
              <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Payout</th>
            </tr></thead>
            <tbody>
              {myBdoList.map((bdo: any) => {
                const r = calcBdo(bdo.id)
                return (
                  <tr key={bdo.id} className="border-t border-gray-50">
                    <td className="px-4 py-2.5 font-medium">{bdo.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.accounts}</td>
                    <td className="px-4 py-2.5 text-green-700 font-medium">{PKR(r.dep)}</td>
                    <td className="px-4 py-2.5 text-blue-600 font-medium">{PKR(r.total)}</td>
                  </tr>
                )
              })}
              {!myBdoList.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No BDOs assigned to you</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────
  const bdos = allProfiles.filter((p: any) => p.role === 'bdo')
  const ams = allProfiles.filter((p: any) => p.role === 'am')
  const analysts = allProfiles.filter((p: any) => p.role === 'trading')
  const bdoResults = bdos.map((b: any) => ({ bdo: b, ...calcBdo(b.id) }))
  const amResults = ams.map((a: any) => ({ am: a, ...calcAm(a.id) }))
  const analystResults = analysts.map((a: any) => ({ analyst: a, ...calcAnalyst(a.id) }))
  const totalBdo = bdoResults.reduce((s: number, r: any) => s + r.total, 0)
  const totalAm = amResults.reduce((s: number, r: any) => s + r.commission + r.bonus, 0)
  const totalAnalyst = analystResults.reduce((s: number, r: any) => s + r.payout, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Commission</h1>
          <p className="text-sm text-gray-400 mt-0.5">All roles</p>
        </div>
        <input type="month" className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          value={month} onChange={e => { setMonth(e.target.value); setLoading(true) }} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-50 rounded-xl p-4"><div className="text-xs text-gray-500 mb-1">BDO payouts</div>
          <div className="text-xl font-medium text-blue-600 text-base">{PKR(totalBdo)}</div></div>
        <div className="bg-gray-50 rounded-xl p-4"><div className="text-xs text-gray-500 mb-1">AM payouts</div>
          <div className="text-xl font-medium text-purple-700 text-base">{PKR(totalAm)}</div></div>
        <div className="bg-gray-50 rounded-xl p-4"><div className="text-xs text-gray-500 mb-1">Analyst payouts</div>
          <div className="text-xl font-medium text-teal-700 text-base">{PKR(totalAnalyst)}</div></div>
        <div className="bg-gray-50 rounded-xl p-4"><div className="text-xs text-gray-500 mb-1">Total</div>
          <div className="text-xl font-medium text-base">{PKR(totalBdo + totalAm + totalAnalyst)}</div></div>
      </div>

      {/* BDO Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">BDO Commissions</div>
        <table className="w-full text-sm"><thead><tr>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">BDO</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Accounts</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Acct bonus</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Deposits</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Dep commission</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">AM share</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Total</th>
        </tr></thead><tbody>
          {bdoResults.map((r: any) => (
            <tr key={r.bdo.id} className="border-t border-gray-50">
              <td className="px-4 py-2.5 font-medium">{r.bdo.name}</td>
              <td className="px-4 py-2.5">{r.accounts}</td>
              <td className="px-4 py-2.5">{r.acctComm ? PKR(r.acctComm) : '—'}</td>
              <td className="px-4 py-2.5 text-green-700 font-medium">{PKR(r.dep)}</td>
              <td className="px-4 py-2.5">{r.depComm ? PKR(r.depComm) : <span className="text-xs text-gray-400">Below threshold</span>}</td>
              <td className="px-4 py-2.5">{r.amShare ? PKR(r.amShare) : '—'}</td>
              <td className="px-4 py-2.5 font-medium text-blue-600">{PKR(r.total)}</td>
            </tr>
          ))}
          {!bdoResults.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No BDOs found</td></tr>}
        </tbody></table>
      </div>

      {/* AM Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">AM Commissions</div>
        <table className="w-full text-sm"><thead><tr>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">AM</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">BDOs</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Target</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Achieved</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Commission</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Bonus</th>
        </tr></thead><tbody>
          {amResults.map((r: any) => (
            <tr key={r.am.id} className="border-t border-gray-50">
              <td className="px-4 py-2.5 font-medium">{r.am.name}</td>
              <td className="px-4 py-2.5">{r.myBdos}</td>
              <td className="px-4 py-2.5">{r.target} clients</td>
              <td className="px-4 py-2.5">
                <div>{r.achieved}/{r.target}</div>
                <div className="mt-1 h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${r.achievePct >= 100 ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, r.achievePct)}%` }} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-purple-700 font-medium">{PKR(r.commission)}</td>
              <td className="px-4 py-2.5">{r.bonus ? PKR(r.bonus) : '—'}</td>
            </tr>
          ))}
          {!amResults.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No AMs found</td></tr>}
        </tbody></table>
      </div>

      {/* Analyst Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">Trading Analyst Commissions</div>
        <table className="w-full text-sm"><thead><tr>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Analyst</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Clients</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Comm generated</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Rate</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Payout</th>
          <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Status</th>
        </tr></thead><tbody>
          {analystResults.map((r: any) => (
            <tr key={r.analyst.id} className="border-t border-gray-50">
              <td className="px-4 py-2.5 font-medium">{r.analyst.name}</td>
              <td className="px-4 py-2.5">{r.clientCount}</td>
              <td className="px-4 py-2.5 text-teal-700 font-medium">{PKR(r.totalGen)}</td>
              <td className="px-4 py-2.5">{r.rate}%</td>
              <td className="px-4 py-2.5 text-blue-600 font-medium">{PKR(r.payout)}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.approved ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {r.approved ? 'Approved' : 'Pending'}
                </span>
              </td>
            </tr>
          ))}
          {!analystResults.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No analysts found</td></tr>}
        </tbody></table>
      </div>
    </div>
  )
}
