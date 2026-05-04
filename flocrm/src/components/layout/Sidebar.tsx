'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import {
  LayoutDashboard, Users, GitBranch, BadgeDollarSign,
  UserCog, Settings, LogOut, TrendingUp, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const allNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin','am','bdo','trading'] },
  { href: '/leads', label: 'Leads', icon: Users, roles: ['admin','am','bdo'] },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch, roles: ['admin','am','bdo'] },
  { href: '/commission', label: 'Commission', icon: BadgeDollarSign, roles: ['admin','am','bdo'] },
  { href: '/trading', label: 'My Clients', icon: TrendingUp, roles: ['trading'] },
  { href: '/team', label: 'Team', icon: UserCog, roles: ['admin','am'] },
  { href: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] },
]

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const nav = allNav.filter(n => n.roles.includes(profile.role))

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const NavLinks = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-base font-medium tracking-tight">
          Flo<span className="text-brand">CRM</span>
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{profile.name}</div>
        <div className="mt-1">
          <span className={clsx('badge text-xs', {
            'bg-blue-50 text-blue-700': profile.role === 'admin',
            'bg-purple-50 text-purple-700': profile.role === 'am',
            'bg-green-50 text-green-700': profile.role === 'bdo',
            'bg-teal-50 text-teal-700': profile.role === 'trading',
          })}>
            {profile.role === 'am' ? 'Asst. Manager'
              : profile.role === 'bdo' ? 'BDO'
              : profile.role === 'trading' ? 'Trading Analyst'
              : 'Admin'}
          </span>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setOpen(false)}
              className={clsx('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all', {
                'bg-brand text-white font-medium': active,
                'text-gray-600 hover:bg-gray-100': !active,
              })}>
              <Icon size={16} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-2 py-3 border-t border-gray-100">
        <button onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 w-full">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 min-h-screen bg-white border-r border-gray-200 fixed left-0 top-0 bottom-0 z-30">
        <NavLinks />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="text-base font-medium">Flo<span className="text-brand">CRM</span></div>
        <button onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-white flex flex-col shadow-xl">
            <NavLinks />
          </aside>
        </div>
      )}
    </>
  )
}
