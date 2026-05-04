'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { Plus, X } from 'lucide-react'

const ROLES: Record<string,string> = { admin:'Admin', am:'Asst. Manager', bdo:'BDO', trading:'Trading Analyst' }
const ROLE_BADGE: Record<string,string> = { admin:'bg-blue-50 text-blue-800', am:'bg-purple-50 text-purple-800', bdo:'bg-green-50 text-green-800', trading:'bg-teal-50 text-teal-800' }

export default function TeamPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'bdo', reports_to:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const fetchProfiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: me } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMyProfile(me as Profile)

    let query = supabase.from('profiles').select('*').order('role').order('name')

    // AMs only see their own BDOs
    if (me?.role === 'am') {
      const { data } = await query.eq('reports_to', user.id)
      setProfiles((data || []) as Profile[])
      return
    }

    const { data } = await query
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
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function toggleActive(p: Profile) {
    await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id)
    fetchProfiles()
  }

  const isAdmin = myProfile?.role === 'admin'
  const isAm = myProfile?.role === 'am'

  const visibleRoles = isAdmin
    ? ['admin','am','bdo','trading'] as const
    : ['bdo'] as const

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href="/dashboard" className="text-base font-medium">Flo<span className="text-blue-600">CRM</span></a>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
      </nav>
      <main className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-medium">{isAm ? 'My Team' : 'Team'}</h1>
          {isAdmin && (
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
              onClick={() => setShowModal(true)}>+ Add Member</button>
          )}
        </div>

        {visibleRoles.map(role => {
          const members = profiles.filter(p => p.role === role)
          if (!members.length) return null
          return (
            <div key={role} className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                {ROLES[role]}s — {members.length}
              </div>
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Role</th>
                  {isAdmin && <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Reports to</th>}
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">Actions</th>}
                </tr></thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} className="border-t border-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                            {m.name.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase()}
                          </div>
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[m.role]}`}>
                          {ROLES[m.role]}
                        </span>
                      </td>
                      {isAdmin && <td className="px-4 py-2.5 text-gray-500 text-xs">{memberName(m.reports_to)}</td>}
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <button className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50"
                            onClick={() => toggleActive(m)}>
                            {m.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.35)'}}>
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-medium">Add Team Member</h2>
                <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">FULL NAME</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">EMAIL (LOGIN)</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" type="email"
                    value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">PASSWORD</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" type="password"
                    value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">ROLE</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value,reports_to:''}))}>
                    <option value="bdo">BDO</option>
                    <option value="am">Assistant Manager</option>
                    <option value="trading">Trading Analyst</option>
                    <option value="admin">Admin</option>
                  </select></div>
                {form.role === 'bdo' && (
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">REPORTS TO AM</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      value={form.reports_to} onChange={e => setForm(f=>({...f,reports_to:e.target.value}))}>
                      <option value="">— None —</option>
                      {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select></div>
                )}
                {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              </div>
              <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-gray-100">
                <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
                  onClick={() => setShowModal(false)}>Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
                  onClick={createMember} disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
