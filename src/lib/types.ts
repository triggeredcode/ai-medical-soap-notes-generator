export interface Utterance {
  speaker: string;
  text: string;
  words?: { text: string; confidence: number }[];
}

export interface TranscriptData {
  id: string;
  status: string;
  text: string;
  utterances: Utterance[];
}

export interface SoapEntry {
  sentence: string;
  mapping: number[];
}

export interface SoapNote {
  Subjective: SoapEntry[];
  Objective: SoapEntry[];
  Assessment: SoapEntry[];
  Plan: SoapEntry[];
}

export type JobStatus =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'generating'
  | 'completed'
  | 'error';
