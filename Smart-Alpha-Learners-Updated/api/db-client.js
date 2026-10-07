import { createClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { triggerRestore } from './db-wake.js';

// The service-role client is retained for authentication/admin operations.
// Authenticated application data requests are transparently routed through a
// request-scoped client carrying the caller's JWT, so Supabase RLS applies.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const baseFetch = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok && res.status >= 500) triggerRestore();
  return res;
};

export const serviceSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: baseFetch },
});

export const requestDbContext = new AsyncLocalStorage();

export function createRequestSupabase(accessToken) {
  if (!ANON_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: baseFetch,
    },
  });
}

// Keep existing imports (`import supabase from './db-client.js'`) working while
// selecting the correct database security context for each request.
const supabase = new Proxy(serviceSupabase, {
  get(target, prop, receiver) {
    const requestClient = requestDbContext.getStore()?.client;
    // Auth/admin APIs must always use the service client. Data APIs use the
    // request-scoped authenticated client when one exists.
    if (prop === 'auth') return Reflect.get(target, prop, receiver);
    if (prop === 'from' || prop === 'rpc' || prop === 'schema' || prop === 'storage') {
      const client = requestClient || target;
      return Reflect.get(client, prop, client).bind(client);
    }
    return Reflect.get(requestClient || target, prop, requestClient || target);
  },
});

export default supabase;
