import type {
  CommissionSettings, BdoTier, AmTier, TaTier,
  Lead, Profile, TradingCommission,
  BdoCommissionResult, AmCommissionResult, AnalystCommissionResult
} from '@/types'

export const PKR = (n: number) =>
  'PKR ' + Math.round(n).toLocaleString('en-PK')

export function totalDeposit(lead: Lead): number {
  return (lead.deposits || []).reduce((s, d) => s + d.amount, 0)
}

export function bdoDepCommissionRate(
  totalDep: number,
  tiers: BdoTier[],
  settings: CommissionSettings
): number {
  if (totalDep < settings.bdo_dep_threshold) return 0
  const sorted = [...tiers].sort((a, b) => b.from_amount - a.from_amount)
  for (const tier of sorted) {
    if (totalDep >= tier.from_amount) return tier.commission_pct
  }
  return settings.bdo_dep_commission_pct
}

export function calcBdoCommission(
  bdo: Profile,
  leads: Lead[],
  settings: CommissionSettings,
  tiers: BdoTier[]
): BdoCommissionResult {
  const myLeads = leads.filter(l => l.bdo_id === bdo.id)
  const accountLeads = myLeads.filter(l =>
    ['account_opened', 'am_handling', 'trading'].includes(l.stage)
  )
  const accounts = accountLeads.length
  const acctCommission =
    accounts > settings.bdo_acct_min_threshold
      ? accounts * settings.bdo_acct_bonus_per_account
      : 0

  const totalDep = myLeads.reduce((s, l) => s + totalDeposit(l), 0)
  const depRate = bdoDepCommissionRate(totalDep, tiers, settings)
  const depCommission = totalDep * depRate / 100

  // BDO share on AM-handled clients
  const amLeads = myLeads.filter(l => l.am_id)
  const amDep = amLeads.reduce((s, l) => s + totalDeposit(l), 0)
  const amShare = amDep * settings.bdo_am_share_pct / 100

  return {
    bdo,
    accounts,
    acct_commission: acctCommission,
    total_deposit: totalDep,
    dep_commission: depCommission,
    am_share: amShare,
    total: acctCommission + depCommission + amShare,
  }
}

export function calcAmCommission(
  am: Profile,
  allLeads: Lead[],
  allProfiles: Profile[],
  settings: CommissionSettings,
  amTiers: AmTier[]
): AmCommissionResult {
  const myBdos = allProfiles.filter(
    p => p.role === 'bdo' && p.reports_to === am.id
  )
  const target = myBdos.length * settings.am_target_per_bdo
  const amLeads = allLeads.filter(
    l => l.am_id === am.id &&
      totalDeposit(l) >= settings.am_min_dep_qualify
  )
  const achieved = amLeads.length
  const totalDep = amLeads.reduce((s, l) => s + totalDeposit(l), 0)
  const commission = totalDep * settings.am_dep_commission_pct / 100

  const achievePct = target > 0 ? (achieved / target) * 100 : 0
  const sorted = [...amTiers].sort((a, b) => b.achieve_pct - a.achieve_pct)
  let bonus = 0
  for (const tier of sorted) {
    if (achievePct >= tier.achieve_pct) { bonus = tier.bonus_amount; break }
  }

  return { am, bdo_count: myBdos.length, target, achieved, total_deposit: totalDep, commission, bonus }
}

export function calcAnalystPayout(
  totalCommission: number,
  settings: CommissionSettings,
  taTiers: TaTier[]
): { rate: number; payout: number } {
  if (totalCommission < settings.ta_min_comm_qualify) return { rate: 0, payout: 0 }
  const sorted = [...taTiers].sort((a, b) => b.min_commission - a.min_commission)
  let rate = settings.ta_payout_pct
  for (const tier of sorted) {
    if (totalCommission >= tier.min_commission) { rate = tier.payout_pct; break }
  }
  return { rate, payout: totalCommission * rate / 100 }
}

export function calcAnalystCommission(
  analyst: Profile,
  commissions: TradingCommission[],
  settings: CommissionSettings,
  taTiers: TaTier[]
): AnalystCommissionResult {
  const myComms = commissions.filter(c => c.analyst_id === analyst.id)
  const totalGen = myComms.reduce((s, c) => s + c.commission_generated, 0)
  const { rate, payout } = calcAnalystPayout(totalGen, settings, taTiers)
  const approved = myComms.every(c => c.approved) && myComms.length > 0
  const clientCount = new Set(myComms.map(c => c.lead_id)).size
  return { analyst, client_count: clientCount, total_commission_generated: totalGen, payout_rate: rate, payout, approved }
}
