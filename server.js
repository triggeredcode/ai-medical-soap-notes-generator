
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs').promises; 
const { default: axios } = require('axios'); 
const fetch = require('node-fetch'); 

//  Configuration & API Keys 
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

//  Environment Variable Check 
if (!ASSEMBLYAI_API_KEY || !GROQ_API_KEY) {
    console.error("CRITICAL: API keys for AssemblyAI or Groq are missing in .env file.");
    process.exit(1);
}

//  AssemblyAI Axios Instance 
const assemblyai = axios.create({
    baseURL: "https://api.assemblyai.com/v2",
    headers: {
        authorization: ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
    },
});

//  In-Memory Storage (Replace with DB for production) 
const jobStore = {}; // Store job status, results, poll timers

//  Multer Setup for File Uploads (Handles both recorded blobs and file uploads) 
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB limit
});

//  Middleware 
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
app.use(express.json()); // Parse JSON bodies

//  Helper Functions 
const generateJobId = () => `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

const updateJobStatus = (jobId, status, data = {}, socket = null) => {
    // If job exists, update and broadcast to room
    if (jobStore[jobId]) {
        jobStore[jobId].status = status;
        jobStore[jobId].lastUpdated = new Date();
        console.log(`[Job ${jobId}] Status Updated: ${status}`, data.message || data.error || '');
        io.to(jobId).emit('statusUpdate', { jobId, status, ...data });

        if (status === 'completed' || status.startsWith('error')) {
            io.to(jobId).emit('finalResult', { jobId, status, results: data.results, error: data.error });
            if (jobStore[jobId].pollTimerId) {
                clearTimeout(jobStore[jobId].pollTimerId);
                delete jobStore[jobId].pollTimerId;
            }
            // Optional: Clean up jobStore entry after a delay
            // setTimeout(() => delete jobStore[jobId], 60000);
        }
    }

    // If socket provided (for dev mode direct response), emit directly to it
    else if (socket) {
        console.log(`[DevMode Socket ${socket.id}] Status Update: ${status}`, data.message || data.error || '');
        // Emit a different event for dev mode results to avoid confusion
        if (status === 'dev_completed' || status === 'dev_error') {
            socket.emit('devGenerateResult', {
                success: status === 'dev_completed',
                results: data.results,
                error: data.error
            });
        } else {
            // Send intermediate dev statuses if needed
            socket.emit('statusUpdate', { jobId: `dev_${socket.id}`, status, ...data });
        }
    }
    else {
        console.warn(`Attempted to update status for non-existent Job ID: ${jobId} and no socket provided.`);
    }
};

//  Groq SOAP Note Generation Function 
const generateSOAPNoteGroq = async (transcriptData, jobId) => {
    // Basic validation of transcript data
    if (!transcriptData || !transcriptData.utterances || !Array.isArray(transcriptData.utterances)) {
        console.error(`[Job ${jobId}] Error: Transcript data is missing or invalid (needs 'utterances' array).`);
        return { error: "Transcript data unusable.", details: "Input object must have an 'utterances' array." };
    }
    if (transcriptData.utterances.length === 0) {
        console.warn(`[Job ${jobId}] Warning: Transcript contains no utterances.`);
        return { Subjective: [], Objective: [], Assessment: [], Plan: [] }; // Return valid empty structure
    }

    let processedText = "";
    transcriptData.utterances.forEach((u, index) => {
        const speakerLabel = String(u.speaker || 'Unknown').replace(/[^a-zA-Z0-9\s_]/g, '');
        const utteranceText = u.text || '';
        processedText += `[Utterance ${index}] Speaker ${speakerLabel}: ${utteranceText}\n`;
    });

    const model = "llama-3.3-70b-versatile"; 

    const prompt = `
You are an AI assistant proficient in generating SOAP notes for clinical documentation. Your task is to process a transcript of a conversation between medical staff and a patient, and produce SOAP notes in JSON format in about 300 words following a specific structure. Carefully analyze the transcript and ensure all output adheres strictly to the format below.

Output Format:
- Provide your response ONLY as a valid JSON object without any introductory text, closing remarks, or markdown code fences (like \`\`\`json ... \`\`\`).
- The JSON object must contain keys: "Subjective", "Objective", "Assessment", and "Plan".
- Each key's value must be an array of objects.
- Each object within the arrays must contain:
  - "sentence": A concise, grammatically correct, single sentence summarizing the information. Ensure there are no line breaks or unnecessary whitespace within the sentence string itself.
  - "mapping": A list of integers representing the zero-based utterance indices from the input transcript that contributed to forming this sentence.

SOAP Note Sections Guide:

Subjective:
Information from the patient's point of view, including feelings, perceptions, and concerns obtained through interviews. Includes Chief Complaint (CC), History of Present Illness (HPI - use OLDCARTS: Onset, Location, Duration, Characterization, Aggravating/Alleviating factors, Radiation, Temporal factor, Severity), Medical History, Surgical History, Family History, Social History (use HEADSS: Home, Education/Employment/Eating, Activities, Drugs, Sexuality, Suicide/Depression), Review of Systems (ROS), and Current Medications/Allergies (including name, dose, route, frequency).

Objective:
Factual, measurable, and observable data obtained through observation, physical examination, and diagnostic testing. Includes Vital signs, Physical exam findings, Laboratory data, Imaging results, Other diagnostic data, and Review of other clinicians' documentation.

Assessment:
The synthesis of subjective and objective evidence to arrive at a diagnosis or differential diagnoses. Includes a summary of the patient's main symptoms/diagnoses and assessment of their progress or status.

Plan:
The course of action for the patient's care based on the Assessment. Includes diagnostic steps (labs, imaging), therapeutic interventions (medications, procedures), patient education, consultations/referrals, and follow-up instructions.

Example JSON Output Structure:
{
  "Subjective": [
    {
      "sentence": "The patient reports experiencing sharp headaches for two weeks.",
      "mapping": [1]
    },
    {
      "sentence": "The patient denies any nausea or vomiting accompanying the headaches.",
      "mapping": [4, 5]
    },
    ......
  ],
  "Objective": [
    {
      "sentence": "Physical examination shows tenderness in the occipital region.",
      "mapping": [6]
    },
    {
      "sentence": "CT scan reveals no structural abnormalities but mild inflammation in the parietal area.",
      "mapping": [9, 10, 13, 14]
    },
    .....
  ],
  "Assessment": [
    {
      "sentence": "The diagnosis suggests tension headaches exacerbated by stress.",
      "mapping": [11]
    }
    , .......
  ],
  "Plan": [
    {
      "sentence": "Prescribe ibuprofen 400 mg orally every 8 hours as needed for pain management.",
      "mapping": [13, 15]
    },
    {
      "sentence": "Refer the patient to a neurologist for further evaluation and management.",
      "mapping": [16]
    },
    ........
  ]
}

<important note:> The above example is for illustrative purposes only and does not represent the actual content of the transcript. The JSON output must be based on the provided transcript data.
This is a small sample of the expected output so it has less number of objects, Your task is to generate a more detailed, covering all the important conversations from the transcript and produce a complete SOAP note based on the provided transcript.
</important note:>

Critical Instructions:
1. Analyze the provided transcript carefully to extract relevant details for each SOAP section.
2. Ensure all "sentence" values are precise, single, grammatically correct sentences without internal line breaks.
3. Generate accurate "mapping" lists by referencing the corresponding [Utterance N] indices from the input transcript.
4. If no relevant utterances contribute to a specific section (e.g., Assessment), provide an empty array for that section's key (e.g., "Assessment": []).
5. Adhere STRICTLY to the JSON output format specified. Do NOT include explanations or any text outside the JSON structure.

Input Transcript:
${processedText}

Now process the input transcript and provide ONLY the JSON object described above, in detailed format, without any additional text or formatting. Ensure the JSON is valid and well-structured with no trailing commas or syntax errors. Use about 300 words in total across all sections, ensuring clarity and conciseness in each sentence. Avoid excessive verbosity or overly complex language
`;

    try {
        console.log(`[Job ${jobId}] Sending request to Groq API with model ${model}...`);
        const requestBody = {
            model: model, messages: [{ role: "user", content: prompt }],
            temperature: 0.2, max_tokens: 4096,
            response_format: { "type": "json_object" }
        };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Groq API request failed: ${response.statusText}`); 
        }
        const data = await response.json();
        const llmOutput = data.choices[0]?.message?.content?.trim();
        if (!llmOutput) { throw new Error("Groq returned empty content."); }

        try {
            const parsedJson = JSON.parse(llmOutput);
            console.log(`[Job ${jobId}] Successfully received and parsed JSON response from Groq.`);
            
            if (!parsedJson.Subjective || !parsedJson.Objective || !parsedJson.Assessment || !parsedJson.Plan) {
                console.warn(`[Job ${jobId}] Warning: Parsed JSON missing one or more standard SOAP keys.`);
            }
            return parsedJson; // Return the successfully parsed JSON object

        } catch (parseError) {
            console.error(`[Job ${jobId}] Failed to parse JSON response from Groq:`, parseError);
            console.error(`[Job ${jobId}] Raw Groq Output (that failed parsing):`, llmOutput);
            return { error: `Failed to parse AI response as JSON: ${parseError.message}` };
        }
    } catch (error) {
        console.error(`[Job ${jobId}] Error during Groq API call or processing: ${error.message}`);
        return { error: `Error generating SOAP note: ${error.message}` };
    }
};

//  AssemblyAI Polling Function 
const pollAssemblyAIStatus = async (jobId, transcriptId) => {
    console.log(`[Job ${jobId}] Polling AssemblyAI for Transcript ID: ${transcriptId}`);
    if (!jobStore[jobId] || jobStore[jobId].status === 'completed' || jobStore[jobId].status?.startsWith('error')) { /* ... stop polling ... */ return; }

    try {
        const response = await assemblyai.get(`/transcript/${transcriptId}`);
        const transcriptData = response.data;
        if (!jobStore[jobId] || jobStore[jobId].status === 'completed' || jobStore[jobId].status?.startsWith('error')) { return; }

        if (transcriptData.status === 'completed') {
            console.log(`[Job ${jobId}] Polling: Transcription completed.`);
            jobStore[jobId].transcriptData = transcriptData;

      
            const transcriptJsonPath = path.join(__dirname, 'transcript.json');
            try {
                await fs.writeFile(transcriptJsonPath, JSON.stringify(transcriptData, null, 2)); // Use await with fs.promises
                console.log(`[Job ${jobId}] Successfully saved transcript to ${transcriptJsonPath}`);
            } catch (writeError) {
                console.error(`[Job ${jobId}] Failed to save transcript to ${transcriptJsonPath}:`, writeError);
                
            }

            updateJobStatus(jobId, 'transcription_completed', { message: 'Transcription complete. Generating SOAP note...' });

            updateJobStatus(jobId, 'generating_outputs', { message: 'Calling Groq API...' });
            const soapNoteJson = await generateSOAPNoteGroq(transcriptData, jobId);

            if (soapNoteJson.error) {
                console.error(`[Job ${jobId}] Groq generation failed:`, soapNoteJson.error);
                updateJobStatus(jobId, 'error_generation', { error: soapNoteJson.error, details: soapNoteJson.details });
            } else {
                console.log(`[Job ${jobId}] Groq generation successful.`);
                updateJobStatus(jobId, 'completed', {
                    results: {
                        transcript: transcriptData,
                        soapNoteJson: soapNoteJson // Send the structured JSON
                    }
                });
            }
        } else if (transcriptData.status === 'error') {
            const errorMessage = transcriptData.error || 'AssemblyAI transcription failed';
            console.error(`[Job ${jobId}] Polling: Transcription failed:`, errorMessage);
            updateJobStatus(jobId, 'error_transcription', { error: errorMessage });
        } else { 
            console.log(`[Job ${jobId}] Polling: Transcription status is '${transcriptData.status}'. Will poll again.`);
            updateJobStatus(jobId, `transcribing_${transcriptData.status}`);
            jobStore[jobId].pollTimerId = setTimeout(() => { pollAssemblyAIStatus(jobId, transcriptId); }, 5000);
        }
    } catch (error) { 
        console.error(`[Job ${jobId}] Error during polling AssemblyAI:`, error);
        updateJobStatus(jobId, 'error_polling', { error: error.message || "Polling failed" });
        if (jobStore[jobId]?.pollTimerId) clearTimeout(jobStore[jobId].pollTimerId);
    }
};

//  API Routes 
// This endpoint now handles BOTH recorded blobs AND file uploads
app.post('/upload', upload.single('audio'), async (req, res) => {
    const jobId = generateJobId();
    const source = req.file.originalname === 'recording.webm' ? 'Recording' : `File (${req.file.originalname})`;
    console.log(`[Job ${jobId}] Received audio upload from ${source}.`);
    jobStore[jobId] = { status: 'received', source: source, createdAt: new Date() };

    if (!req.file || !req.file.buffer) {
        const errorMsg = !req.file ? 'No file received.' : 'Received empty file buffer.';
        console.error(`[Job ${jobId}] Upload failed: ${errorMsg}`);
        updateJobStatus(jobId, 'error_upload', { error: errorMsg });
        return res.status(400).json({ jobId, error: errorMsg });
    }

    try {
        updateJobStatus(jobId, 'uploading_assemblyai');
        console.log(`[Job ${jobId}] Uploading ${req.file.buffer.length} bytes to AssemblyAI...`);
        const uploadResponse = await assemblyai.post('/upload', req.file.buffer);
        const uploadUrl = uploadResponse.data.upload_url;
        console.log(`[Job ${jobId}] AssemblyAI Upload URL: ${uploadUrl}`);
        updateJobStatus(jobId, 'uploaded_assemblyai');
        console.log(`[Job ${jobId}] Submitting transcription request...`);
        updateJobStatus(jobId, 'submitting_transcription');
        const transcriptResponse = await assemblyai.post('/transcript', {
            audio_url: uploadUrl,
            speaker_labels: true,
            language_code: 'en_us',
        });
        const transcriptId = transcriptResponse.data.id;
        jobStore[jobId].transcriptId = transcriptId;
        console.log(`[Job ${jobId}] Transcription submitted. Transcript ID: ${transcriptId}`);
        updateJobStatus(jobId, 'transcribing_queued');
        res.status(202).json({ jobId }); // Respond immediately
        jobStore[jobId].pollTimerId = setTimeout(() => { pollAssemblyAIStatus(jobId, transcriptId); }, 1000); // Start polling

    } catch (error) {

        console.error(`[Job ${jobId}] Error during AssemblyAI processing:`, error.response?.data || error.message);
        const errorMessage = error.response?.data?.error || error.message || 'AssemblyAI processing failed';
        updateJobStatus(jobId, 'error_assemblyai', { error: errorMessage });
    }
});

//  WebSocket Connection Handling 
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('joinJobRoom', (jobId) => {
        // ... (same as before) ...
        if (jobStore[jobId]) {
            socket.join(jobId);
            console.log(`Client ${socket.id} joined room for Job ID: ${jobId}`);
            socket.emit('statusUpdate', { jobId, status: jobStore[jobId].status }); 
        } else { 
            console.warn(`Client ${socket.id} attempted to join non-existent Job ID: ${jobId}`);
            socket.emit('statusUpdate', { jobId, status: 'error', error: 'Invalid Job ID' });
        }
    });

    //  Listener for Dev Mode SOAP Generation Request 
    socket.on('devGenerateRequest', async (data) => {
        const devJobId = `dev_${socket.id}`;
        console.log(`[${devJobId}] Received devGenerateRequest.`);
        const transcriptJsonPath = path.join(__dirname, 'transcript.json'); // Path to the local transcript file

        updateJobStatus(null, 'dev_reading_file', { message: 'Reading local transcript.json...' }, socket);

        try {
            // 1. Read local transcript file
            const transcriptFileContent = await fs.readFile(transcriptJsonPath, 'utf8');
            updateJobStatus(null, 'dev_parsing_file', { message: 'Parsing transcript...' }, socket);

            // 2. Parse transcript file
            let transcriptData;
            try {
                transcriptData = JSON.parse(transcriptFileContent);
            } catch (parseError) {
                console.error(`[${devJobId}] Failed to parse transcript.json:`, parseError);
                updateJobStatus(null, 'dev_error', { error: `Failed to parse transcript.json: ${parseError.message}` }, socket);
                return;
            }

            // 3. Generate SOAP note
            updateJobStatus(null, 'dev_generating_outputs', { message: 'Calling Groq API...' }, socket);
            const soapNoteJson = await generateSOAPNoteGroq(transcriptData, devJobId); // Pass parsed data

            // 4. Send result back to client
            if (soapNoteJson.error) {
                console.error(`[${devJobId}] Groq generation failed in Dev Mode:`, soapNoteJson.error);
                updateJobStatus(null, 'dev_error', { error: soapNoteJson.error }, socket);
            } else {
                console.log(`[${devJobId}] Dev Mode Groq generation successful.`);
                // Send success result directly back to the requesting socket
                updateJobStatus(null, 'dev_completed', {
                    results: {
                        transcript: transcriptData, // Send the transcript data used
                        soapNoteJson: soapNoteJson
                    }
                }, socket);
            }

        } catch (error) {
            console.error(`[${devJobId}] Error during Dev Mode processing:`, error);
            let errorMessage = `Error in dev mode: ${error.message}`;
            if (error.code === 'ENOENT') {
                errorMessage = "Error: transcript.json not found in project root.";
            }
            updateJobStatus(null, 'dev_error', { error: errorMessage }, socket);
        }
    });


    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start Server 
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Access the app at http://localhost:${port}`);
});
