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
    { label: 'My Leads', href: '/my-leads' },
    { label: 'Team Leads', href: '/leads' },
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

export default function AppNav() {
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    setCurrentPath(window.location.pathname)
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/auth/login'; return }
      setEmail(data.user.email || '')
      const { data: profile } = await supabase
        .from('profiles').select('role, name').eq('id', data.user.id).single()
      if (profile) { setRole(profile.role); setName(profile.name) }
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
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const nav = ROLE_NAV[role] || []
  const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()

  return (
    <nav className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <a href="/dashboard" className="text-base font-medium flex-shrink-0">
        Flo<span className="text-blue-600">CRM</span>
      </a>

      <div className="flex items-center gap-0.5 overflow-x-auto">
        {nav.map(n => {
          const active = currentPath === n.href || currentPath.startsWith(n.href + '/')
          return (
            <a key={n.href} href={n.href}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap flex-shrink-0
                ${active
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'}`}>
              {n.label}
            </a>
          )
        })}
      </div>

      <div className="relative flex-shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center hover:bg-blue-700 transition-colors">
          {initials || '?'}
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-11 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center flex-shrink-0">
                  {initials || '?'}
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
            <div className="py-1">
              {nav.map(n => (
                <a key={n.href} href={n.href}
                  className={`flex items-center px-4 py-2 text-sm transition-colors
                    ${currentPath === n.href ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {n.label}
                </a>
              ))}
            </div>
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
  )
}
