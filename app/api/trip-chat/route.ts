import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  try {
    const { message, tripName, history } = (await req.json()) as {
      message: string;
      tripName: string;
      history?: ChatMessage[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `Si cestovný asistent výlučne pre výlet "${tripName}".
Odpovedáš LEN na otázky priamo súvisiace s touto destináciou alebo výletom: pamiatky, aktivity, reštaurácie, ubytovanie, doprava, počasie, tipy, balenie, miestne zvyklosti.
Ak sa otázka netýka výletu "${tripName}" ani cestovania, odpovedz: "Táto otázka nesúvisí s výletom ${tripName}. Môžem pomôcť s tipmi na aktivity, reštaurácie, pamiatky alebo praktické rady pre tento výlet."

Formátovanie:
- NIKDY nepoužívaj markdown (**bold**, *italic*, ###, atď.)
- Píš čistý text
- Pri zoznamoch použi číslovaný zoznam alebo nový riadok s pomlčkou: "- položka"
- Každý bod na novom riadku
- Odpoveď max 5-7 riadkov, stručne a konkrétne
- Použi slovenčinu. Ak je otázka po anglicky, odpovedaj po anglicky.`;

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

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[trip-chat]', msg);
    return NextResponse.json({ error: 'Chat failed', reply: '' }, { status: 500 });
  }
}
