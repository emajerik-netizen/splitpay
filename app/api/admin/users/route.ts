import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
    }

    // Verify caller is an admin
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Check admin role
    const adminCheckClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roleRow } = await adminCheckClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .single();

    if (roleRow?.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Fetch all auth users (paginated, max 1000)
    const { data: listData, error: listError } = await adminCheckClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const users = (listData?.users || []).map((u) => {
      // Google/OAuth users have provider set in app_metadata or identities
      const provider: string = (u.app_metadata?.provider as string) ?? 'email';
      const hasOAuthIdentity = Array.isArray(u.identities) && u.identities.some(
        (id) => id.provider !== 'email'
      );
      return {
        id: u.id,
        email: u.email ?? '',
        email_confirmed_at: u.email_confirmed_at ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        provider,
        is_oauth: hasOAuthIdentity || provider !== 'email',
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[admin/users] unexpected error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
