import { NextRequest, NextResponse } from 'next/server';
import { generateSoapNote } from '@/lib/groq';
import type { TranscriptData } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: { transcript: TranscriptData } = await req.json();

    if (!body.transcript?.utterances?.length) {
      return NextResponse.json(
        { error: 'Transcript data with utterances is required' },
        { status: 400 },
      );
    }

    const soapNote = await generateSoapNote(body.transcript);
    return NextResponse.json({ soapNote });
  } catch (err: any) {
    console.error('SOAP generation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
