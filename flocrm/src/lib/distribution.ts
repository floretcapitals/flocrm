import type { DistributionConfig, Profile } from '@/types'

export interface DistributionResult {
  lead_id: string
  assigned_bdo_id: string
  assigned_bdo_name: string
}

/**
 * Build weighted sequence: BDO with weight=3 appears 3 times in the pool.
 * Round robin simply gives each active BDO one slot.
 */
export function buildPool(
  configs: DistributionConfig[],
  mode: 'roundrobin' | 'weighted'
): DistributionConfig[] {
  const active = configs.filter(c => !c.is_paused && c.weight > 0)
  if (mode === 'roundrobin') return active
  const pool: DistributionConfig[] = []
  active.forEach(c => { for (let i = 0; i < c.weight; i++) pool.push(c) })
  return pool
}

/**
 * Distribute N lead IDs across BDOs starting from pointer.
 * Returns assignments and the new pointer position.
 */
export function distribute(
  leadIds: string[],
  configs: DistributionConfig[],
  mode: 'roundrobin' | 'weighted',
  pointer: number
): { assignments: DistributionResult[]; newPointer: number } {
  const pool = buildPool(configs, mode)
  if (!pool.length) return { assignments: [], newPointer: pointer }

  const assignments: DistributionResult[] = []
  let ptr = pointer % pool.length

  for (const lid of leadIds) {
    const cfg = pool[ptr % pool.length]
    assignments.push({
      lead_id: lid,
      assigned_bdo_id: cfg.bdo_id,
      assigned_bdo_name: cfg.bdo?.name ?? cfg.bdo_id,
    })
    ptr = (ptr + 1) % pool.length
  }

  return { assignments, newPointer: ptr }
}
