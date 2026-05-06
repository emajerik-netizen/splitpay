import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { promises as dns } from 'dns';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type SupportPayload = {
  email?: string;
  name?: string;
  subject?: string;
  message?: string;
  lang?: 'sk' | 'en';
};

function isValidEmail(value: string) {
  // Strict: single @ sign, proper domain with TLD, no display-name format like "Name <addr>"
  if (/<[^>]+>/.test(value)) return false;
  if (value.includes(',') || value.includes(';')) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(value);
}

function sanitizeText(value: string): string {
  // Strip HTML tags and null bytes
  return value.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim();
}

async function domainHasMx(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

async function logSpam(email: string, subject: string, message: string, reason: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !serviceKey) return;
    const supabase = createClient(supabaseUrl, serviceKey);
    await supabase.from('support_spam_log').insert({ email, subject, message, reason });
  } catch {
    // non-critical, ignore
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SupportPayload;
    const email = (payload.email || '').trim().toLowerCase();
    const name = sanitizeText((payload.name || '').slice(0, 100)) || 'Unknown';
    const subject = sanitizeText((payload.subject || '').replace(/[\r\n]+/g, ' ')).slice(0, 140);
    const message = sanitizeText(payload.message || '').slice(0, 5000);

    if (!email || !subject || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      // Silently discard - don't tell the sender the email was rejected
      void logSpam(email, subject, message, 'invalid_format');
      return NextResponse.json({ ok: true });
    }

    const mxExists = await domainHasMx(email);
    if (!mxExists) {
      // Silently discard - domain has no mail servers
      void logSpam(email, subject, message, 'no_mx_record');
      return NextResponse.json({ ok: true });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'resend_not_configured', missing: ['RESEND_API_KEY'] }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM || 'support@splitpay.sk';
    const to = process.env.SUPPORT_TO || 'support@splitpay.sk';
    const locale = payload.lang === 'en' ? 'en' : 'sk';
    const appLabel = locale === 'en' ? 'SplitPay Support Request' : 'SplitPay žiadosť na podporu';

    const replyTo = isValidEmail(email) ? email : undefined;

    const result = await resend.emails.send({
      from,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject: `[SplitPay] ${subject}`,
      html: `
        <h2>${appLabel}</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <pre style="white-space: pre-wrap; font-family: inherit;">${message}</pre>
      `,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as { message?: string };
    console.error('[support] send failed', {
      message: err?.message,
    });

    return NextResponse.json(
      { error: 'send_failed', message: err?.message || null },
      { status: 500 }
    );
  }
}
