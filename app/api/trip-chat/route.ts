import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  try {
    const { message, tripName, history, tripContext } = (await req.json()) as {
      message: string;
      tripName: string;
      history?: ChatMessage[];
      tripContext?: {
        members: string[];
        expenses: { title: string; amount: number; payer: string; date: string; category: string }[];
        balances: { name: string; balance: number }[];
        currency: string;
        totalSpent: number;
      };
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let contextBlock = '';
    if (tripContext) {
      const expLines = tripContext.expenses.map(
        (e) => `  - ${e.title}: ${e.amount} ${tripContext.currency} (platil: ${e.payer || '?'}, ${e.date || ''}, kategória: ${e.category || '?'})`
      ).join('\n');
      const balLines = tripContext.balances.map(
        (b) => `  - ${b.name}: ${b.balance > 0 ? '+' : ''}${b.balance} ${tripContext.currency}`
      ).join('\n');
      contextBlock = `
Údaje výletu (použi ich pri otázkach o výdavkoch, členoch, bilanciách):
Členovia: ${tripContext.members.join(', ')}
Celková útrata: ${tripContext.totalSpent} ${tripContext.currency}
Výdavky:
${expLines || '  (žiadne)'}
Aktuálne bilancie (kladné = dostane, záporné = zaplatí):
${balLines || '  (všetko vyrovnané)'}`;
    }

    const systemPrompt = `Si AI asistent pre výlet "${tripName}". Odpovedáš na akékoľvek otázky — destinačné tipy, financie výletu, alebo čokoľvek iné.
${contextBlock}

Formátovanie — PRÍSNE PRAVIDLÁ:
- NIKDY nepoužívaj markdown: žiadne **, *, ###, \`, atď.
- Píš len čistý text
- Každý bod zoznamu na novom riadku s pomlčkou: "- položka"
- Max 6-8 riadkov, stručne a konkrétne
- Slovenčina, ak otázka v angličtine → po anglicky`;

    const messages: Anthropic.MessageParam[] = [
      ...(history || []).slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const reply = raw
      .replace(/^#{1,6}\s*/gm, '')               // # heading na začiatku riadku
      .replace(/\*\*([\s\S]+?)\*\*/g, '$1')      // **bold** → bold
      .replace(/\*([\s\S]+?)\*/g, '$1')           // *italic* → italic
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')     // `code` a ```code```
      .replace(/_{2}([\s\S]+?)_{2}/g, '$1')      // __bold__
      .replace(/_([\s\S]+?)_/g, '$1')             // _italic_
      .replace(/\[([\s\S]+?)\]\([\s\S]+?\)/g, '$1') // [link](url) → link
      .trim();
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[trip-chat]', msg);
    return NextResponse.json({ error: 'Chat failed', reply: '' }, { status: 500 });
  }
}
