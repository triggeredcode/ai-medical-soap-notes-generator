import type { TranscriptData, SoapNote } from './types';

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const MODEL = 'llama-3.3-70b-versatile';

export async function generateSoapNote(transcript: TranscriptData): Promise<SoapNote> {
  if (!transcript.utterances?.length) {
    return { Subjective: [], Objective: [], Assessment: [], Plan: [] };
  }

  let processedText = '';
  transcript.utterances.forEach((u, i) => {
    const speaker = String(u.speaker || 'Unknown').replace(/[^a-zA-Z0-9\s_]/g, '');
    processedText += `[Utterance ${i}] Speaker ${speaker}: ${u.text}\n`;
  });

  const prompt = `You are an AI assistant generating SOAP notes from a medical transcript.

Output ONLY a valid JSON object with keys: "Subjective", "Objective", "Assessment", "Plan".
Each key's value is an array of objects with "sentence" (string) and "mapping" (array of utterance indices).

Subjective: patient-reported info (CC, HPI, history, medications, allergies).
Objective: measurable data (vitals, exam findings, labs, imaging).
Assessment: diagnosis synthesis and differential.
Plan: next steps (tests, medications, referrals, follow-up).

Input Transcript:
${processedText}

Return ONLY the JSON object. No markdown fences, no explanations.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.statusText}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content.trim());
}
