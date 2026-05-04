import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isAuthPage = pathname.startsWith('/auth')
  const hasSession = request.cookies.getAll().some(c => 
    c.name.includes('auth-token') || c.name.includes('sb-')
  )

  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
