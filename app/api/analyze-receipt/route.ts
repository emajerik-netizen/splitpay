import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

export type ReceiptItem = { name: string; price: number };
export type ReceiptResult = {
  items: ReceiptItem[];
  total: number;
  currency: string;
  error?: string;
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = (await req.json()) as { image: string; mimeType: string };

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(mimeType as AllowedType)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as AllowedType, data: image },
            },
            {
              type: 'text',
              text: `Extract all line items from this receipt/bill image.
Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"items":[{"name":"item name","price":12.50}],"total":45.00,"currency":"EUR"}

Rules:
- price must be a number (no currency symbols)
- If you see a total/suma line, use it as "total"; otherwise sum the items
- Infer currency from the receipt (EUR, USD, CZK, etc.); default EUR
- If the image is not a receipt or is unreadable, return: {"items":[],"total":0,"currency":"EUR","error":"Cannot read receipt"}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ items: [], total: 0, currency: 'EUR', error: 'Could not parse receipt' } satisfies ReceiptResult);
    }

    const data = JSON.parse(match[0]) as ReceiptResult;
    data.items = (data.items || []).filter((i) => i.name && typeof i.price === 'number' && i.price > 0);
    data.total = typeof data.total === 'number' && data.total > 0
      ? data.total
      : data.items.reduce((s, i) => s + i.price, 0);

    return NextResponse.json(data satisfies ReceiptResult);
  } catch (err) {
    console.error('[analyze-receipt]', err);
    return NextResponse.json({ items: [], total: 0, currency: 'EUR', error: 'Analysis failed' } satisfies ReceiptResult, { status: 500 });
  }
}
