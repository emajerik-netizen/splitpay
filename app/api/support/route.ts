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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SupportPayload;
    const email = (payload.email || '').trim().toLowerCase();
    const name = (payload.name || '').trim() || 'Unknown';
    const subject = (payload.subject || '').trim().replace(/[\r\n]+/g, ' ');
    const message = (payload.message || '').trim();

    if (!email || !subject || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    if (subject.length > 140 || message.length > 5000) {
      return NextResponse.json({ error: 'invalid_lengths' }, { status: 400 });
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
