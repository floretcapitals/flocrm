import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/auth/login')

  return (
    <div className="p-8">
      <h1 className="text-2xl font-medium mb-2">Welcome to FloCRM</h1>
      <p className="text-gray-500">Logged in as: {user.email}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <a href="/leads" className="card hover:border-brand transition-colors cursor-pointer">
          <div className="text-xs text-gray-500 mb-1">Leads</div>
          <div className="text-2xl font-medium text-brand">→</div>
        </a>
        <a href="/pipeline" className="card hover:border-brand transition-colors cursor-pointer">
          <div className="text-xs text-gray-500 mb-1">Pipeline</div>
          <div className="text-2xl font-medium text-brand">→</div>
        </a>
        <a href="/commission" className="card hover:border-brand transition-colors cursor-pointer">
          <div className="text-xs text-gray-500 mb-1">Commission</div>
          <div className="text-2xl font-medium text-brand">→</div>
        </a>
        <a href="/admin" className="card hover:border-brand transition-colors cursor-pointer">
          <div className="text-xs text-gray-500 mb-1">Admin</div>
          <div className="text-2xl font-medium text-brand">→</div>
        </a>
      </div>
    </div>
  )
}
