import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.assemblyai.com/v2',
  headers: {
    authorization: process.env.ASSEMBLYAI_API_KEY!,
    'content-type': 'application/json',
  },
});

export async function uploadAudio(buffer: Buffer): Promise<string> {
  const { data } = await client.post('/upload', buffer);
  return data.upload_url;
}

export async function submitTranscription(audioUrl: string): Promise<string> {
  const { data } = await client.post('/transcript', {
    audio_url: audioUrl,
    speaker_labels: true,
    language_code: 'en_us',
  });
  return data.id;
}

export async function pollTranscription(transcriptId: string) {
  const { data } = await client.get(`/transcript/${transcriptId}`);
  return data;
}
