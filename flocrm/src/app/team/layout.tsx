export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="text-base font-medium">Flo<span className="text-blue-600">CRM</span></div>
        <div className="flex gap-4 text-sm">
          <a href="/leads" className="text-gray-600 hover:text-gray-900">Leads</a>
          <a href="/pipeline" className="text-gray-600 hover:text-gray-900">Pipeline</a>
          <a href="/commission" className="text-gray-600 hover:text-gray-900">Commission</a>
          <a href="/team" className="text-gray-600 hover:text-gray-900">Team</a>
          <a href="/admin" className="text-gray-600 hover:text-gray-900">Admin</a>
        </div>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  )
}
