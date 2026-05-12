import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { tripName, members, expenses, currency, date } = (await req.json()) as {
      tripName: string;
      members: string[];
      expenses: { title: string; amount: number; payer: string; category?: string }[];
      currency: string;
      date: string;
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const expenseList = expenses
      .slice(0, 25)
      .map((e) => `- ${e.title}: ${Number(e.amount).toFixed(2)} ${currency} (zaplatil ${e.payer})`)
      .join('\n');

    const prompt = `Si asistent ktorý píše krátke a priateľské súhrny skupinových výletov pre slovensky hovoriacich používateľov.

Výlet: ${tripName}
Dátum: ${date || 'neuvedený'}
Členovia: ${members.join(', ')}
Celkom minuté: ${total.toFixed(2)} ${currency}

Výdavky:
${expenseList || '(žiadne výdavky)'}

Napíš krátky, priateľský súhrn tohto výletu v slovenčine (3–4 vety).
Zahrň: celkovú sumu, najväčšiu položku alebo kategóriu, a záverečnú motivačnú alebo milú vetu.
Nepoužívaj emoji. Píš priamo, bez nadpisov.`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 350, temperature: 0.75 },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error('[trip-summary] Gemini error', res.status, txt.slice(0, 200));
      return NextResponse.json({ error: `Gemini ${res.status}` }, { status: 500 });
    }

    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return NextResponse.json({ summary });
  } catch (err) {
    console.error('[trip-summary]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
