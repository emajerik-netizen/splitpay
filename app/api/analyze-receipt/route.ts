import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ items: [], total: 0, currency: 'EUR', error: 'Missing API key — set GEMINI_API_KEY in Vercel' } satisfies ReceiptResult, { status: 500 });
    }

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: image } },
          {
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
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0 },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('[analyze-receipt] Gemini error', res.status, errText.slice(0, 200));
      return NextResponse.json({ items: [], total: 0, currency: 'EUR', error: `Gemini ${res.status}: ${errText.slice(0, 100)}` } satisfies ReceiptResult, { status: 500 });
    }

    const geminiData = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[analyze-receipt]', msg);
    return NextResponse.json(
      { items: [], total: 0, currency: 'EUR', error: `Analysis failed: ${msg.slice(0, 120)}` } satisfies ReceiptResult,
      { status: 500 }
    );
  }
}
