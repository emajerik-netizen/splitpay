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

    const systemPrompt = `Si cestovný asistent pre výlet "${tripName}".
Pomáhaš skupinám cestovateľov s radami o destináciách, tipmi na aktivity, reštaurácie, ubytovanie a praktické informácie.
Odpovedaj stručne a konkrétne. Používaj slovenčinu. Ak je otázka v angličtine, odpovedaj po anglicky.
Ak nevieš na čo sa pýtajú, opýtaj sa na upresnenie.`;

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
