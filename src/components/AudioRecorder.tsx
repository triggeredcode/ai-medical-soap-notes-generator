'use client';

import { useState, useRef, useCallback } from 'react';

interface AudioRecorderProps {
  onUpload: (file: File | Blob, name: string) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ onUpload, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
      if (chunksRef.current.length) {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onUpload(blob, 'recording.webm');
      }
      setRecording(false);
      setElapsed(0);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, [onUpload]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file, file.name);
    e.target.value = '';
  };

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const ss = (elapsed % 60).toString().padStart(2, '0');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        {recording ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Stop {mm}:{ss}
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={disabled}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Record
          </button>
        )}
      </div>
      <div className="text-sm text-gray-400">or</div>
      <label className="cursor-pointer rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:border-gray-400">
        Upload Audio File
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          disabled={disabled || recording}
          className="hidden"
        />
      </label>
    </div>
  );
}
