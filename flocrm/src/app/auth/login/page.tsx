'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus('Attempting sign in...')
    
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setStatus('ERROR: ' + error.message)
      setLoading(false)
      return
    }

    setStatus('Signed in! User: ' + data.user?.email + ' — redirecting...')
    setTimeout(() => {
      window.location.replace('/dashboard')
    }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium">Flo<span className="text-blue-600">CRM</span></h1>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">EMAIL</label>
              <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" 
                type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">PASSWORD</label>
              <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" 
                type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {status && (
              <p className="text-xs p-3 rounded-lg bg-gray-50 border border-gray-200 break-all">{status}</p>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
