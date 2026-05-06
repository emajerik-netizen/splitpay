import { NextResponse } from 'next/server';
import { Resend } from 'resend';

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
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
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
