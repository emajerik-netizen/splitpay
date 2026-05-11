import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
  if (!tripId) return NextResponse.json({ error: 'missing_tripId' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const svc = createClient(supabaseUrl, serviceKey);

  try {
    // Use a SQL RPC as a safe fallback to find the trip by id across trip_states.
    // There isn't a simple PostgREST filter for jsonb array element equality in all setups,
    // so prefer a small RPC named `lookup_trip_by_id` if present, otherwise try a best-effort select.
    const rpcRes = await svc.rpc('lookup_trip_by_id', { p_trip_id: tripId });
    // rpcRes may be { data: {...} }
    if (rpcRes?.data && rpcRes.data.inviteCode) {
      return NextResponse.json({ inviteCode: rpcRes.data.inviteCode });
    }

    // Best-effort: scan recent trip_states for matching trip id
    const { data, error } = await svc
      .from('trip_states')
      .select('state_json')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error || !data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    for (const row of data as any[]) {
      const state = row.state_json as any;
      if (!state?.trips) continue;
      const trip = (state.trips as any[]).find((t) => t.id === tripId);
      if (trip) return NextResponse.json({ inviteCode: trip.inviteCode || null });
    }

    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
