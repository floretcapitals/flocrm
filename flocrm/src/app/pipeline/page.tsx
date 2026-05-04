'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PKR, totalDeposit } from '@/lib/commission'
import type { Lead, Profile } from '@/types'

const STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-50 text-blue-800 border-blue-100' },
  { key: 'contacted', label: 'Contacted', color: 'bg-amber-50 text-amber-800 border-amber-100' },
  { key: 'account_opened', label: 'Account Opened', color: 'bg-green-50 text-green-800 border-green-100' },
  { key: 'am_handling', label: 'AM Handling', color: 'bg-purple-50 text-purple-800 border-purple-100' },
  { key: 'trading', label: 'Trading', color: 'bg-teal-50 text-teal-800 border-teal-100' },
]

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from('leads').select('*, deposits(*)').order('updated_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ])
    setLeads((l || []) as Lead[])
    setProfiles((p || []) as Profile[])
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function moveStage(lead: Lead, newStage: string) {
    await supabase.from('leads').update({ stage: newStage }).eq('id', lead.id)
    fetchData()
  }

  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '—'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">{leads.length} total leads</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.stage === stage.key)
          const stageDep = stageLeads.reduce((s, l) => s + totalDeposit(l), 0)
          return (
            <div key={stage.key}>
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-2 border text-xs font-medium ${stage.color}`}>
                <span>{stage.label}</span>
                <span className="opacity-70">{stageLeads.length}</span>
              </div>
              {stageDep > 0 && (
                <div className="text-xs text-gray-400 text-center mb-2">{PKR(stageDep)}</div>
              )}
              <div className="space-y-2">
                {stageLeads.map(lead => (
                  <div key={lead.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
                    <div className="font-medium text-sm mb-0.5">{lead.name}</div>
                    <div className="text-xs text-gray-400 mb-2">{lead.city || 'No city'}</div>
                    {totalDeposit(lead) > 0 && (
                      <div className="text-xs font-medium text-brand mb-2">{PKR(totalDeposit(lead))}</div>
                    )}
                    <div className="text-xs text-gray-400 mb-2">{memberName(lead.bdo_id)}</div>
                    <div className="flex gap-1 flex-wrap">
                      {STAGES.filter(s => s.key !== stage.key).map(s => (
                        <button key={s.key} onClick={() => moveStage(lead, s.key)}
                          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                          → {s.label.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!stageLeads.length && (
                  <div className="text-center py-6 text-xs text-gray-300 border border-dashed border-gray-200 rounded-xl">
                    Empty
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
