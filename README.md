# AI Medical Scribe

AI-powered medical documentation tool. Record or upload patient visit audio, get speaker-labeled transcripts and structured SOAP notes with source-utterance mapping.

## Tech Stack

- **Framework**: Next.js 14 (App Router, API Routes)
- **UI**: React, Tailwind CSS
- **AI**: AssemblyAI (transcription + speaker diarization), Groq (SOAP note generation)
- **Language**: TypeScript

## How It Works

1. Record audio or upload a file via the web UI
2. Audio is uploaded to AssemblyAI for transcription with speaker labels
3. Transcript is sent to Groq's LLM to generate a structured SOAP note
4. Each SOAP sentence links back to the source utterance indices — hover to cross-reference

## Setup

```bash
npm install
```

Create a `.env.local` file:

```
ASSEMBLYAI_API_KEY=your_key
GROQ_API_KEY=your_key
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
