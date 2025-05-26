'use client';

import { useState, useCallback } from 'react';
import AudioRecorder from '@/components/AudioRecorder';
import TranscriptView from '@/components/TranscriptView';
import SoapNoteView from '@/components/SoapNoteView';
import type { TranscriptData, SoapNote, JobStatus } from '@/lib/types';

export default function Home() {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [statusText, setStatusText] = useState('Ready');
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [soapNote, setSoapNote] = useState<SoapNote | null>(null);
  const [highlightedIndices, setHighlightedIndices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (file: File | Blob, name: string) => {
    setStatus('uploading');
    setStatusText(`Uploading ${name}...`);
    setError(null);
    setTranscript(null);
    setSoapNote(null);

    try {
      const formData = new FormData();
      formData.append('audio', file, name);

      setStatus('transcribing');
      setStatusText('Transcribing audio with AssemblyAI...');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Processing failed');

      setTranscript(data.transcript);
      setSoapNote(data.soapNote);
      setStatus('completed');
      setStatusText('Done');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
      setStatusText('Error');
    }
  }, []);

  const processing = status === 'uploading' || status === 'transcribing' || status === 'generating';

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="mr-2">🩺</span>AI Medical Scribe
        </h1>
        <p className="mt-1 text-gray-500">
          Record or upload audio. Get speaker-labeled transcripts and interactive SOAP notes.
        </p>
      </header>

      <section className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Audio Input</h2>
        <AudioRecorder onUpload={handleUpload} disabled={processing} />
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-600">Status:</span>
          {processing && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          )}
          <span className={error ? 'text-red-600' : 'text-gray-800'}>
            {error || statusText}
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            Transcript
            <span className="ml-2 text-xs font-normal text-gray-400">
              (color = confidence)
            </span>
          </h2>
          <div className="max-h-[600px] overflow-y-auto">
            <TranscriptView data={transcript} highlightedIndices={highlightedIndices} />
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">SOAP Note</h2>
          <p className="mb-3 text-xs text-gray-400">
            Hover a sentence to see its source utterances.
          </p>
          <div className="max-h-[600px] overflow-y-auto">
            <SoapNoteView data={soapNote} onHoverMapping={setHighlightedIndices} />
          </div>
        </section>
      </div>

      <footer className="mt-8 text-center text-xs text-gray-400">
        Powered by AssemblyAI &amp; Groq
      </footer>
    </main>
  );
}
