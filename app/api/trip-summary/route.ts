import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const expenseList = expenses
      .slice(0, 25)
      .map((e) => `- ${e.title}: ${Number(e.amount).toFixed(2)} ${currency} (zaplatil ${e.payer})`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [
        {
          role: 'user',
          content: `Si asistent ktorý píše krátke a priateľské súhrny skupinových výletov pre slovensky hovoriacich používateľov.

Výlet: ${tripName}
Dátum: ${date || 'neuvedený'}
Členovia: ${members.join(', ')}
Celkom minuté: ${total.toFixed(2)} ${currency}

Výdavky:
${expenseList || '(žiadne výdavky)'}

Napíš krátky, priateľský súhrn tohto výletu v slovenčine (3–4 vety).
Zahrň: celkovú sumu, najväčšiu položku alebo kategóriu, a záverečnú milú vetu.
Nepoužívaj emoji. Píš priamo, bez nadpisov.`,
        },
      ],
    });

    const summary = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[trip-summary]', msg);
    return NextResponse.json({ error: msg.slice(0, 120) }, { status: 500 });
  }
}
