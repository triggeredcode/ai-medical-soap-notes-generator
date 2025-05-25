'use client';

import { useState, useCallback } from 'react';
import type { SoapNote } from '@/lib/types';

const SECTION_LABELS: Record<keyof SoapNote, { label: string; color: string }> = {
  Subjective: { label: 'Subjective', color: 'border-blue-400 bg-blue-50' },
  Objective: { label: 'Objective', color: 'border-emerald-400 bg-emerald-50' },
  Assessment: { label: 'Assessment', color: 'border-amber-400 bg-amber-50' },
  Plan: { label: 'Plan', color: 'border-purple-400 bg-purple-50' },
};

interface SoapNoteViewProps {
  data: SoapNote | null;
  onHoverMapping?: (indices: number[]) => void;
}

export default function SoapNoteView({ data, onHoverMapping }: SoapNoteViewProps) {
  const [hoveredMapping, setHoveredMapping] = useState<number[] | null>(null);

  const handleMouseEnter = useCallback(
    (mapping: number[]) => {
      setHoveredMapping(mapping);
      onHoverMapping?.(mapping);
    },
    [onHoverMapping],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredMapping(null);
    onHoverMapping?.([]);
  }, [onHoverMapping]);

  if (!data) {
    return <p className="text-sm text-gray-500 italic">SOAP note will appear here...</p>;
  }

  return (
    <div className="space-y-6">
      {(Object.keys(SECTION_LABELS) as (keyof SoapNote)[]).map((key) => {
        const entries = data[key];
        if (!entries?.length) return null;
        const { label, color } = SECTION_LABELS[key];
        return (
          <div key={key}>
            <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
              {label}
            </h4>
            <div className="space-y-2">
              {entries.map((entry, i) => {
                const hasMapping = entry.mapping?.length > 0;
                const isHovered =
                  hoveredMapping &&
                  hasMapping &&
                  JSON.stringify(hoveredMapping) === JSON.stringify(entry.mapping);
                return (
                  <p
                    key={i}
                    onMouseEnter={() => hasMapping && handleMouseEnter(entry.mapping)}
                    onMouseLeave={handleMouseLeave}
                    className={`rounded-lg border-l-4 px-3 py-2 text-sm ${color} ${
                      hasMapping ? 'cursor-pointer hover:shadow-md' : ''
                    } ${isHovered ? 'ring-2 ring-indigo-400' : ''}`}
                  >
                    {entry.sentence}
                    {hasMapping && (
                      <span className="ml-2 text-xs text-gray-400">
                        [{entry.mapping.join(', ')}]
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
