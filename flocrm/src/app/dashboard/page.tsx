'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ROLE_NAV: Record<string, { label: string; href: string }[]> = {
  admin: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Leads', href: '/leads' },
    { label: 'Pipeline', href: '/pipeline' },
    { label: 'Commission', href: '/commission' },
    { label: 'Team', href: '/team' },
    { label: 'Admin', href: '/admin' },
  ],
  am: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Leads', href: '/leads' },
    { label: 'Pipeline', href: '/pipeline' },
    { label: 'Commission', href: '/commission' },
    { label: 'My Team', href: '/team' },
  ],
  bdo: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Leads', href: '/leads' },
    { label: 'Pipeline', href: '/pipeline' },
    { label: 'My Commission', href: '/commission' },
  ],
  trading: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'My Clients', href: '/trading' },
    { label: 'My Commission', href: '/commission' },
  ],
}

const ROLE_CARDS: Record<string, { label: string; href: string; desc: string }[]> = {
  admin: [
    { label: 'Leads', href: '/leads', desc: 'All leads across team' },
    { label: 'Pipeline', href: '/pipeline', desc: 'Visual pipeline board' },
    { label: 'Commission', href: '/commission', desc: 'All commission payouts' },
    { label: 'Team', href: '/team', desc: 'Manage team members' },
    { label: 'Admin Settings', href: '/admin', desc: 'Commission & distribution' },
  ],
  am: [
    { label: 'Leads', href: '/leads', desc: 'Team leads' },
    { label: 'Pipeline', href: '/pipeline', desc: 'Team pipeline' },
    { label: 'Commission', href: '/commission', desc: 'Team commissions' },
    { label: 'My Team', href: '/team', desc: 'Your BDOs & their leads' },
  ],
  bdo: [
    { label: 'My Leads', href: '/leads', desc: 'Leads assigned to you' },
    { label: 'Pipeline', href: '/pipeline', desc: 'Your lead stages' },
    { label: 'My Commission', href: '/commission', desc: 'Your earnings this month' },
  ],
  trading: [
    { label: 'My Clients', href: '/trading', desc: 'Clients assigned to you' },
    { label: 'My Commission', href: '/commission', desc: 'Your trading commission' },
  ],
}

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/auth/login'; return }
      setEmail(data.user.email || '')
      const { data: profile } = await supabase
        .from('profiles').select('role, name').eq('id', data.user.id).single()
      if (profile) { setRole(profile.role); setName(profile.name) }
      setLoading(false)
    })
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )

  const nav = ROLE_NAV[role] || ROLE_NAV.bdo
  const cards = ROLE_CARDS[role] || ROLE_CARDS.bdo
  const roleLabel = role === 'am' ? 'Assistant Manager' : role === 'bdo' ? 'BDO' : role === 'trading' ? 'Trading Analyst' : 'Admin'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="text-base font-medium">Flo<span className="text-blue-600">CRM</span></div>
        <div className="flex items-center gap-1">
          {nav.map(n => (
            <a key={n.href} href={n.href}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              {n.label}
            </a>
          ))}
          <button onClick={signOut}
            className="ml-3 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            Sign out
          </button>
        </div>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-medium">Welcome, {name || email}</h1>
          <div className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium
            bg-blue-50 text-blue-700">
            {roleLabel}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {cards.map(card => (
            <a key={card.href} href={card.href}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="font-medium text-sm mb-1">{card.label}</div>
              <div className="text-xs text-gray-400">{card.desc}</div>
              <div className="text-blue-600 text-sm mt-3 font-medium">Open →</div>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}
