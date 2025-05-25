'use client';

import type { TranscriptData } from '@/lib/types';

function confidenceColor(c: number | undefined): string {
  if (c == null || c < 0) return 'transparent';
  const hue = c * 120;
  return `hsl(${hue}, 85%, 80%)`;
}

interface TranscriptViewProps {
  data: TranscriptData | null;
  highlightedIndices?: number[];
}

export default function TranscriptView({ data, highlightedIndices = [] }: TranscriptViewProps) {
  if (!data?.utterances?.length) {
    return <p className="text-sm text-gray-500 italic">Transcript will appear here...</p>;
  }

  return (
    <div className="space-y-3">
      {data.utterances.map((u, idx) => {
        const highlighted = highlightedIndices.includes(idx);
        return (
          <div
            key={idx}
            data-index={idx}
            className={`rounded-lg p-3 text-sm transition-colors ${
              highlighted ? 'bg-yellow-100 ring-2 ring-yellow-400' : 'bg-gray-50'
            }`}
          >
            <span className="mr-2 font-semibold text-indigo-600">
              Speaker {u.speaker || '?'}:
            </span>
            {u.words?.length ? (
              u.words.map((w, wi) => (
                <span
                  key={wi}
                  title={`Confidence: ${w.confidence?.toFixed(2) ?? 'N/A'}`}
                  style={{ backgroundColor: confidenceColor(w.confidence) }}
                  className="rounded-sm px-0.5"
                >
                  {w.text}{' '}
                </span>
              ))
            ) : (
              <span>{u.text}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
