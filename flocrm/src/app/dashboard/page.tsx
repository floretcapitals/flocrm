'use client'
import { useEffect, useState, useRef } from 'react'
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

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  am: 'Assistant Manager',
  bdo: 'Business Development Officer',
  trading: 'Trading Analyst',
}

const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-blue-50 text-blue-700',
  am: 'bg-purple-50 text-purple-700',
  bdo: 'bg-green-50 text-green-700',
  trading: 'bg-teal-50 text-teal-700',
}

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
  const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()

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
        </div>

        {/* Profile icon + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center hover:bg-blue-700 transition-colors">
            {initials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-11 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {/* Profile header */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{name}</div>
                    <div className="text-xs text-gray-400 truncate">{email}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABEL[role] || role}
                  </span>
                </div>
              </div>

              {/* Quick links */}
              <div className="py-1">
                {nav.slice(1).map(n => (
                  <a key={n.href} href={n.href}
                    className="flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    {n.label}
                  </a>
                ))}
              </div>

              {/* Sign out */}
              <div className="border-t border-gray-100 py-1">
                <button onClick={signOut}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-medium">Welcome, {name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{ROLE_LABEL[role]}</p>
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
