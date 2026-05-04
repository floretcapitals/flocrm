'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { Plus, X } from 'lucide-react'

const ROLES = { admin: 'Admin', am: 'Asst. Manager', bdo: 'BDO', trading: 'Trading Analyst' }
const ROLE_BADGE: Record<string,string> = { admin:'bg-blue-50 text-blue-800', am:'bg-purple-50 text-purple-800', bdo:'bg-green-50 text-green-800', trading:'bg-teal-50 text-teal-800' }

export default function TeamPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'bdo', reports_to:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('role').order('name')
    setProfiles((data || []) as Profile[])
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  const ams = profiles.filter(p => p.role === 'am')
  const memberName = (id: string | null) => profiles.find(p => p.id === id)?.name ?? '—'

  async function createMember() {
    if (!form.name || !form.email || !form.password) return setError('All fields required')
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/team/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowModal(false)
      setForm({ name:'', email:'', password:'', role:'bdo', reports_to:'' })
      fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  async function toggleActive(p: Profile) {
    await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id)
    fetchProfiles()
  }

  const leadCountForProfile = async (id: string) => {
    const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('bdo_id', id)
    return count || 0
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Team</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={14} /> Add Member</button>
      </div>

      {(['admin','am','bdo','trading'] as const).map(role => {
        const members = profiles.filter(p => p.role === role)
        if (!members.length) return null
        return (
          <div key={role} className="card mb-4">
            <div className="card-title">{ROLES[role]}s — {members.length}</div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Name</th><th>Role</th><th>Reports to</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                            {m.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}
                          </div>
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td><span className={`badge ${ROLE_BADGE[m.role]}`}>{ROLES[m.role]}</span></td>
                      <td className="text-gray-500 text-xs">{memberName(m.reports_to)}</td>
                      <td><span className={`badge ${m.is_active ? 'badge-account_opened' : 'bg-gray-100 text-gray-500'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <button className={`btn-secondary text-xs ${m.is_active ? '' : 'text-green-700'}`} onClick={() => toggleActive(m)}>
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium">Add Team Member</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Full name</label><input className="input" value={form.name} onChange={e => setForm(f=>({...f, name:e.target.value}))} /></div>
              <div><label className="label">Email (login)</label><input className="input" type="email" value={form.email} onChange={e => setForm(f=>({...f, email:e.target.value}))} /></div>
              <div><label className="label">Password</label><input className="input" type="password" placeholder="Temporary password" value={form.password} onChange={e => setForm(f=>({...f, password:e.target.value}))} /></div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f=>({...f, role:e.target.value, reports_to:''}))}>
                  <option value="bdo">BDO</option>
                  <option value="am">Assistant Manager</option>
                  <option value="trading">Trading Analyst</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {form.role === 'bdo' && (
                <div>
                  <label className="label">Reports to AM</label>
                  <select className="input" value={form.reports_to} onChange={e => setForm(f=>({...f, reports_to:e.target.value}))}>
                    <option value="">— None —</option>
                    {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-gray-100">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={createMember} disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
