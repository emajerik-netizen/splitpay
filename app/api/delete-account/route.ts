import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
    }

    // Verify caller identity using their JWT
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Use anon client to verify the token
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const userId = userData.user.id;

    // Use service role client to delete the user
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[delete-account] deleteUser failed:', deleteError.message);
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delete-account] unexpected error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
