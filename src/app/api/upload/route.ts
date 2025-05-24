import { NextRequest, NextResponse } from 'next/server';
import { uploadAudio, submitTranscription, pollTranscription } from '@/lib/assemblyai';
import { generateSoapNote } from '@/lib/groq';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const audioUrl = await uploadAudio(buffer);
    const transcriptId = await submitTranscription(audioUrl);

    let transcript = await pollTranscription(transcriptId);
    while (transcript.status !== 'completed' && transcript.status !== 'error') {
      await new Promise((r) => setTimeout(r, 3000));
      transcript = await pollTranscription(transcriptId);
    }

    if (transcript.status === 'error') {
      return NextResponse.json(
        { error: transcript.error || 'Transcription failed' },
        { status: 500 },
      );
    }

    const soapNote = await generateSoapNote(transcript);

    return NextResponse.json({ transcript, soapNote });
  } catch (err: any) {
    console.error('Upload processing error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
