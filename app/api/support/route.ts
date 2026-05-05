import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

type SupportPayload = {
  email?: string;
  name?: string;
  subject?: string;
  message?: string;
  lang?: 'sk' | 'en';
};

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass || Number.isNaN(port)) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SupportPayload;
    const email = (payload.email || '').trim().toLowerCase();
    const name = (payload.name || '').trim() || 'Unknown';
    const subject = (payload.subject || '').trim();
    const message = (payload.message || '').trim();

    if (!email || !subject || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    if (subject.length > 140 || message.length > 5000) {
      return NextResponse.json({ error: 'invalid_lengths' }, { status: 400 });
    }

    const transport = getTransport();
    if (!transport) {
      return NextResponse.json({ error: 'smtp_not_configured' }, { status: 500 });
    }

    const from = process.env.SMTP_FROM || 'support@splitpay.sk';
    const to = process.env.SUPPORT_TO || 'support@splitpay.sk';
    const locale = payload.lang === 'en' ? 'en' : 'sk';
    const appLabel = locale === 'en' ? 'SplitPay Support Request' : 'SplitPay žiadosť na podporu';

    await transport.sendMail({
      from,
      to,
      replyTo: email,
      subject: `[SplitPay] ${subject}`,
      text: `${appLabel}\n\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
      html: `
        <h2>${appLabel}</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <pre style="white-space: pre-wrap; font-family: inherit;">${message}</pre>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as { code?: string; responseCode?: number; message?: string };
    console.error('[support] send failed', {
      code: err?.code,
      responseCode: err?.responseCode,
      message: err?.message,
    });

    if (err?.code === 'EAUTH' || err?.responseCode === 535) {
      return NextResponse.json({ error: 'smtp_auth_failed' }, { status: 500 });
    }

    if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNECTION' || err?.code === 'ESOCKET') {
      return NextResponse.json({ error: 'smtp_unreachable' }, { status: 500 });
    }

    return NextResponse.json({ error: 'send_failed' }, { status: 500 });
  }
}
