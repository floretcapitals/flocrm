export type Role = 'admin' | 'am' | 'bdo' | 'trading'
export type Stage = 'new' | 'contacted' | 'account_opened' | 'am_handling' | 'trading'
export type DistributionMode = 'roundrobin' | 'weighted'

export interface Profile {
  id: string
  name: string
  role: Role
  reports_to: string | null
  is_active: boolean
  created_at: string
}

export interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  notes: string | null
  stage: Stage
  bdo_id: string | null
  am_id: string | null
  analyst_id: string | null
  source: string | null
  created_at: string
  updated_at: string
  // joined
  bdo?: Profile
  am?: Profile
  analyst?: Profile
  deposits?: Deposit[]
  total_deposit?: number
}

export interface Deposit {
  id: string
  lead_id: string
  amount: number
  deposit_date: string
  notes: string | null
  created_at: string
}

export interface TradingCommission {
  id: string
  lead_id: string
  analyst_id: string | null
  month: string
  commission_generated: number
  analyst_payout: number | null
  payout_rate: number | null
  approved: boolean
  created_at: string
  // joined
  lead?: Lead
  analyst?: Profile
}

export interface CommissionSettings {
  id: string
  bdo_acct_min_threshold: number
  bdo_acct_bonus_per_account: number
  bdo_dep_threshold: number
  bdo_dep_commission_pct: number
  bdo_am_share_pct: number
  bdo_cycle: string
  am_target_per_bdo: number
  am_min_dep_qualify: number
  am_dep_commission_pct: number
  am_escalate_threshold: number
  am_cycle: string
  ta_payout_pct: number
  ta_min_comm_qualify: number
  ta_max_clients: number
  ta_cycle: string
  ta_approval_required: boolean
  currency: string
  commission_approval: boolean
  carry_forward: boolean
}

export interface BdoTier {
  id: string
  from_amount: number
  to_amount: number | null
  commission_pct: number
  sort_order: number
}

export interface AmTier {
  id: string
  achieve_pct: number
  bonus_amount: number
}

export interface TaTier {
  id: string
  min_commission: number
  payout_pct: number
  notes: string | null
}

export interface TRD {
  id: string
  lead_id: string
  created_by: string
  account_number: string | null
  cdc_account: string | null
  account_type: string | null
  platform: string | null
  risk_profile: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DistributionConfig {
  bdo_id: string
  weight: number
  is_paused: boolean
  bdo?: Profile
}

export interface BdoCommissionResult {
  bdo: Profile
  accounts: number
  acct_commission: number
  total_deposit: number
  dep_commission: number
  am_share: number
  total: number
}

export interface AmCommissionResult {
  am: Profile
  bdo_count: number
  target: number
  achieved: number
  total_deposit: number
  commission: number
  bonus: number
}

export interface AnalystCommissionResult {
  analyst: Profile
  client_count: number
  total_commission_generated: number
  payout_rate: number
  payout: number
  approved: boolean
}
