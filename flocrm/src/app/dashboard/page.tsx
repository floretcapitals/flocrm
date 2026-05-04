'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = '/auth/login'
      } else {
        setEmail(data.user.email || '')
        setLoading(false)
      }
    })
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="text-base font-medium">Flo<span className="text-blue-600">CRM</span></div>
        <div className="flex items-center gap-4 text-sm">
          <a href="/leads" className="text-gray-600 hover:text-gray-900">Leads</a>
          <a href="/pipeline" className="text-gray-600 hover:text-gray-900">Pipeline</a>
          <a href="/commission" className="text-gray-600 hover:text-gray-900">Commission</a>
          <a href="/team" className="text-gray-600 hover:text-gray-900">Team</a>
          <a href="/admin" className="text-gray-600 hover:text-gray-900">Admin</a>
          <button onClick={signOut} className="text-red-500 hover:text-red-700">Sign out</button>
        </div>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-medium mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm mb-6">Welcome, {email}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[['Leads','leads'],['Pipeline','pipeline'],['Commission','commission'],['Admin','admin']].map(([label, href]) => (
            <a key={href} href={`/${href}`}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
              <div className="text-sm text-gray-500 mb-1">{label}</div>
              <div className="text-blue-600 font-medium">Open →</div>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}
