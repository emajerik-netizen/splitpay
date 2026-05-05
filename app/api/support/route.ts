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
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = process.env[key]?.trim();
      if (value) return value;
    }
    return '';
  };

  const host = read('SMTP_HOST', 'SMTP_HOSTNAME', 'SMTP_SERVER');
  const user = read('SMTP_USER', 'SMTP_USERNAME');
  const pass = read('SMTP_PASS', 'SMTP_PASSWORD');
  const portRaw = read('SMTP_PORT', 'SMTP_SERVER_PORT') || '587';
  const secureRaw = read('SMTP_SECURE');
  const port = Number(portRaw);
  const secure = secureRaw ? secureRaw === 'true' : port === 465;

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (Number.isNaN(port)) missing.push('SMTP_PORT');

  if (missing.length > 0) {
    return { transport: null, missing };
  }

  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    }),
    missing,
  };
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

    const { transport, missing } = getTransport();
    if (!transport) {
      return NextResponse.json({ error: 'smtp_not_configured', missing }, { status: 500 });
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
