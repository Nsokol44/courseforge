// ── SERVER CLIENT ──
// Only import this in Server Components, Route Handlers, and Middleware.
// This file uses next/headers and cannot be imported by Client Components.

import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Use in Server Components (pages, layouts)
export const createServerClient = () =>
  createServerComponentClient({ cookies })

// Use in Route Handlers (app/api/**/route.ts)
// Route handlers need createRouteHandlerClient, not createServerComponentClient
export const createRouteClient = () =>
  createRouteHandlerClient({ cookies })

// Admin client — bypasses RLS, only use server-side
export const createAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
