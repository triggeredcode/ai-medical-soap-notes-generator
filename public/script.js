document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const timerDisplay = document.getElementById('timerDisplay'); // Timer
    const recordingStatus = document.getElementById('recordingStatus');
    const errorDisplay = document.getElementById('errorDisplay');
    const audioFileInput = document.getElementById('audioFileInput'); // File input
    const uploadButton = document.getElementById('uploadButton'); // Upload button
    const transcriptOutput = document.getElementById('transcriptOutput');
    const soapOutput = document.getElementById('soapOutput');
    const currentTimeDisplay = document.getElementById('currentTime');
    const mappingDialog = document.getElementById('mapping-dialog');

    // Dev Mode Elements
    const toggleDevModeButton = document.getElementById('toggleDevMode');
    const devModeControlsDiv = document.getElementById('devModeControls');
    const generateLocalButton = document.getElementById('generateLocalButton');
    const retrySoapButton = document.getElementById('retrySoapButton');
    const resetDevViewButton = document.getElementById('resetDevViewButton');
    const devStatusDisplay = document.getElementById('devStatus');
    const devErrorDisplay = document.getElementById('devErrorDisplay');


    // --- State Variables ---
    let mediaRecorder;
    let audioChunks = [];
    let currentJobId = null; // For tracking normal recording/upload jobs
    let fullTranscriptData = null; // Store the complete transcript object
    let soapNoteJson = null; // Store the parsed JSON SOAP note object
    let timerInterval = null;
    let elapsedSeconds = 0;
    let isDevModeActive = true; // Track dev mode state

    // --- WebSocket Connection & Basic Handlers ---
    const socket = io();
    socket.on('connect', () => {
        console.log('Connected to WebSocket server.');
        // Auto-trigger initial dev load shortly after connection
        updateStatusDisplay('Idle'); // Set initial main status
        updateStatusDisplay("Loading initial transcript...", false, true); // Set initial dev status
        setTimeout(() => {
            console.log("Attempting initial load from transcript.json...");
            socket.emit('devGenerateRequest', { initialLoad: true });
            // Optional: Disable buttons during initial load
            disableDevControls();
            disableMainControls(); // Disable normal controls during initial load too
        }, 500); // Small delay to ensure socket is fully ready
    });
    socket.on('disconnect', () => { console.warn('Disconnected.'); updateStatusDisplay('Disconnected. Please refresh.', true); disableStopButton(); stopTimer(); });
    socket.on('joinJobRoom', (jobId) => { console.log(`Joined room for Job ID: ${jobId}`); });
    socket.on('statusUpdate', handleStatusUpdate); // Handles updates for normal jobs
    socket.on('finalResult', handleFinalResult); // Handles final result for normal jobs
    socket.on('devGenerateResult', handleDevGenerateResult); // Handles result for dev mode generation

    // --- UI Update Functions ---
    function updateStatusDisplay(message, isError = false, isDev = false) {
        const statusEl = isDev ? devStatusDisplay : recordingStatus;
        const errorEl = isDev ? devErrorDisplay : errorDisplay;

        statusEl.textContent = message;
        if (isError) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            statusEl.style.color = '#dc3545';
        } else {
            errorEl.style.display = 'none';
            statusEl.style.color = ''; // Reset color
        }
        if (!isDev) console.log("Main Status:", message);
        else console.log("Dev Status:", message);
    }

    function enableMainControls() {
        startButton.disabled = false;
        uploadButton.disabled = false;
        audioFileInput.disabled = false;
    }
    function disableMainControls() {
        startButton.disabled = true;
        stopButton.disabled = true;
        uploadButton.disabled = true;
        audioFileInput.disabled = true;
    }
    function enableDevControls() {
        generateLocalButton.disabled = false;
        retrySoapButton.disabled = false;
        resetDevViewButton.disabled = false;
    }
    function disableDevControls() {
        generateLocalButton.disabled = true;
        retrySoapButton.disabled = true;
        resetDevViewButton.disabled = true;
    }

    function enableStopButton() { stopButton.disabled = false; recordingIndicator.classList.add('recording'); }
    function disableStopButton() { stopButton.disabled = true; recordingIndicator.classList.remove('recording'); }

    // Called when starting any long process (recording, upload, dev generate)
    function showProcessingState(statusMessage, processingType = 'normal') { // 'normal' or 'dev'
        // Reset previous errors
        updateStatusDisplay("", false); // Clear main error
        updateStatusDisplay("Idle", false, true); // Clear dev error/status

        if (processingType === 'normal') {
            updateStatusDisplay(statusMessage);
            disableMainControls(); // Disable recording/upload controls
            disableDevControls(); // Also disable dev controls during normal run
            // Clear previous results
            transcriptOutput.innerHTML = `<p class="placeholder">${statusMessage}...</p>`;
            soapOutput.innerHTML = `<p class="placeholder">Waiting for results...</p>`;
        } else { // dev processing
            updateStatusDisplay(statusMessage, false, true); // Update dev status
            disableMainControls(); // Disable normal controls during dev run
            disableDevControls(); // Disable dev controls during generation
            // Optionally clear results when starting dev generation
            // transcriptOutput.innerHTML = `<p class="placeholder">Generating from local file...</p>`;
            // soapOutput.innerHTML = `<p class="placeholder">Generating from local file...</p>`;
        }

        fullTranscriptData = null;
        soapNoteJson = null;
        hideMappingDialog();
    }

    // --- Timer Functions ---
    function updateTimer() {
        elapsedSeconds++;
        const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
        const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${minutes}:${seconds}`;
    }
    function startTimer() {
        stopTimer(); // Clear any existing interval
        elapsedSeconds = 0;
        timerDisplay.textContent = "00:00";
        timerInterval = setInterval(updateTimer, 1000);
    }
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // --- WebSocket Event Handlers ---
    function handleStatusUpdate(data) { // For NORMAL jobs
        if (data.jobId === currentJobId) {
            // console.log('Status Update:', data);
            let userMessage = data.message || `Processing: ${data.status}`;
            // ... (make messages user-friendly as before) ...
            if (data.status?.startsWith('error')) {
                updateStatusDisplay(`Error: ${data.error || data.status}`, true);
            } else {
                updateStatusDisplay(userMessage);
            }
        }
    }

    function handleFinalResult(data) { // For NORMAL jobs
        if (data.jobId === currentJobId) {
            console.log("Normal Job Final Result received:", data);
            stopTimer(); // Ensure timer stops if recording was involved
            if (data.status === 'completed' && data.results) {
                updateStatusDisplay('Processing Complete!');
                fullTranscriptData = data.results.transcript;
                soapNoteJson = data.results.soapNoteJson;

                if (!fullTranscriptData || !soapNoteJson) { /* ... handle missing data ... */
                    console.error("Error: Incomplete results received.");
                    updateStatusDisplay("Error: Received incomplete results.", true);
                } else {
                    displayTranscript(fullTranscriptData);
                    renderSoapNote(soapNoteJson);
                }
            } else { /* ... handle error status ... */
                const errorMessage = data.error || 'An unknown error occurred.';
                console.error("Normal Job failed:", errorMessage, data);
                updateStatusDisplay(`Error: ${errorMessage}`, true);
                transcriptOutput.innerHTML = `<p class="placeholder">Failed.</p>`;
                soapOutput.innerHTML = `<p class="placeholder">Failed.</p>`;
            }
            enableMainControls(); // Re-enable controls after normal job finishes
            if (isDevModeActive) enableDevControls(); // Re-enable dev if active
            currentJobId = null; // Reset current job ID
        }
    }

    function handleDevGenerateResult(data) { // For DEV mode results
        console.log("Dev Mode Result received:", data);
        if (data.success && data.results) {
            updateStatusDisplay('Dev Generation Complete!', false, true);
            fullTranscriptData = data.results.transcript; // Store transcript used
            soapNoteJson = data.results.soapNoteJson;

            if (!fullTranscriptData || !soapNoteJson) { /* ... handle missing data ... */
                console.error("Error: Incomplete dev results received.");
                updateStatusDisplay("Error: Received incomplete dev results.", true, true);
            } else {
                displayTranscript(fullTranscriptData);
                renderSoapNote(soapNoteJson);
            }
        } else { // Handle dev error
            const errorMessage = data.error || 'Unknown error during dev generation.';
            console.error("Dev Mode generation failed:", errorMessage, data);
            updateStatusDisplay(`Dev Error: ${errorMessage}`, true, true);

        }
        // Re-enable controls after dev attempt
        enableMainControls();
        if (isDevModeActive) enableDevControls();
    }


    // --- Media Recorder Setup & Handlers ---
    async function setupMediaRecorder() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Explicitly use webm
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
            mediaRecorder.onstart = () => {
                audioChunks = [];
                enableStopButton();
                disableMainControls(); // Disable upload/start during recording
                disableDevControls(); // Disable dev mode during recording
                updateStatusDisplay('Recording...');
                startTimer(); // Start timer
                console.log('Recording started.');
            };
            mediaRecorder.onstop = () => {
                console.log('Recording stopped.');
                stopTimer(); // Stop timer
                disableStopButton(); // Disable stop button immediately
                // Call function to handle blob upload
                handleBlobUpload();
            };
            mediaRecorder.onerror = (event) => { /* ... error handling ... */ stopTimer(); enableMainControls(); };
            updateStatusDisplay('Ready to record / upload');
            enableMainControls();
        } catch (err) { /* ... error handling ... */ updateStatusDisplay(`Error: Mic Access - ${err.message}`, true); disableMainControls(); }
    }

    // --- Upload Logic ---
    // Function to handle recorded blob upload
    async function handleBlobUpload() {
        if (audioChunks.length === 0) {
            console.warn("No audio data recorded.");
            updateStatusDisplay("No audio data was recorded.", true);
            enableMainControls(); // Re-enable controls if nothing recorded
            return;
        }
        showProcessingState('Processing recording...', 'normal'); // Show processing
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm'); // Filename helps server identify source
        audioChunks = []; // Clear chunks
        await submitAudio(formData); // Call common submission function
    }

    // Function to handle file upload from input
    async function uploadAudioFile() {
        const file = audioFileInput.files[0];
        if (!file) {
            updateStatusDisplay("Please select an audio file first.", true);
            return;
        }
        showProcessingState(`Uploading ${file.name}...`, 'normal');
        const formData = new FormData();
        formData.append('audio', file, file.name);
        audioFileInput.value = ''; // Clear the input
        await submitAudio(formData); // Call common submission function
    }

    // Common function to submit FormData (blob or file) to /upload
    async function submitAudio(formData) {
        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Upload failed: ${response.status}`);
            currentJobId = result.jobId;
            console.log(`Upload successful. Job ID: ${currentJobId}. Waiting for updates...`);
            updateStatusDisplay('Upload complete. Waiting for transcription...');
            socket.emit('joinJobRoom', currentJobId);
        } catch (error) {
            console.error('Audio submission failed:', error);
            updateStatusDisplay(`Error: ${error.message}`, true);
            enableMainControls(); // Re-enable on failure
            if (isDevModeActive) enableDevControls();
            currentJobId = null;
        }
    }

    // --- Button Event Listeners ---
    startButton.onclick = () => { if (mediaRecorder && mediaRecorder.state === "inactive") mediaRecorder.start(); };
    stopButton.onclick = () => { if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop(); };
    uploadButton.onclick = uploadAudioFile; // Use the upload function

    // Dev Mode Listeners
    toggleDevModeButton.onclick = () => {
        isDevModeActive = !isDevModeActive; // Toggle the state
        devModeControlsDiv.style.display = isDevModeActive ? 'block' : 'none';
        toggleDevModeButton.textContent = isDevModeActive ? 'Hide Dev Mode' : 'Show Dev Mode';
        // Reset dev status display when toggling
        updateStatusDisplay("Idle", false, true);
        // If turning dev mode ON, maybe enable dev controls?
        if (isDevModeActive) {
            enableDevControls();
        }
    };

    generateLocalButton.onclick = () => {
        console.log("Requesting SOAP generation from local transcript.json...");
        showProcessingState("Requesting generation from local file...", 'dev');
        socket.emit('devGenerateRequest', { timestamp: Date.now() });
    };

    retrySoapButton.onclick = () => {
        // Same action as generate button
        console.log("Retrying SOAP generation from local transcript.json...");
        showProcessingState("Retrying generation from local file...", 'dev');
        socket.emit('devGenerateRequest', { timestamp: Date.now(), retry: true });
    };

    resetDevViewButton.onclick = () => {
        console.log("Resetting Dev View...");
        transcriptOutput.innerHTML = `<p class="placeholder">Transcript cleared.</p>`;
        soapOutput.innerHTML = `<p class="placeholder">SOAP Note cleared.</p>`;
        updateStatusDisplay("Idle", false, true); // Reset dev status
        // Clear stored data related to the view
        fullTranscriptData = null;
        soapNoteJson = null;
        hideMappingDialog();
        // Re-enable controls after reset
        enableDevControls();
        enableMainControls();
    };

    // --- Confidence to Color Helper ---
    function getConfidenceColor(confidence) { /* ... (same as before) ... */
        if (confidence == null || confidence < 0) return 'transparent';
        const hue = confidence * 120; const saturation = 85; const lightness = 80;
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    // --- Display Transcript Function ---
    function displayTranscript(transcriptData) { 
        transcriptOutput.innerHTML = '';
        if (!transcriptData || !transcriptData.utterances || transcriptData.utterances.length === 0) { /*... handle fallback or empty ...*/
            transcriptOutput.innerHTML = '<p class="placeholder">Transcript data not available or empty.</p>';
            return;
        }
        transcriptData.utterances.forEach((utterance, index) => {
            const utteranceDiv = document.createElement('div');
            utteranceDiv.classList.add('utterance');
            utteranceDiv.dataset.utteranceIndex = index; // Crucial for mapping
            const speakerSpan = document.createElement('span');
            speakerSpan.classList.add('speaker');
            speakerSpan.textContent = `Speaker ${utterance.speaker || 'Unknown'}:`;
            utteranceDiv.appendChild(speakerSpan);
            if (utterance.words && utterance.words.length > 0) { /* ... render words with confidence spans ... */
                utterance.words.forEach(word => {
                    const wordSpan = document.createElement('span');
                    wordSpan.classList.add('word-span');
                    wordSpan.textContent = word.text + " ";
                    wordSpan.style.backgroundColor = getConfidenceColor(word.confidence);
                    wordSpan.title = `Conf: ${word.confidence?.toFixed(2) ?? 'N/A'}`;
                    utteranceDiv.appendChild(wordSpan);
                });
            } else { utteranceDiv.appendChild(document.createTextNode(utterance.text)); }
            transcriptOutput.appendChild(utteranceDiv);
        });
    }

    // --- Render SOAP Note from JSON Data ---
    function renderSoapNote(soapJsonData) { 
        soapOutput.innerHTML = '';
        if (!soapJsonData || typeof soapJsonData !== 'object' || Object.keys(soapJsonData).length === 0) { /* ... handle invalid ... */
            soapOutput.innerHTML = '<p class="placeholder">SOAP note data is not available or invalid.</p>';
            return;
        }
        const sections = ["Subjective", "Objective", "Assessment", "Plan"];
        sections.forEach(sectionKey => {
            const sectionData = soapJsonData[sectionKey];
            if (sectionData && Array.isArray(sectionData) && sectionData.length > 0) {
                const header = document.createElement('h3'); header.textContent = sectionKey; soapOutput.appendChild(header);
                const sentenceContainer = document.createElement('div'); sentenceContainer.classList.add('soap-section-content'); soapOutput.appendChild(sentenceContainer);
                sectionData.forEach(item => {
                    if (item && typeof item.sentence === 'string') {
                        const sentenceElement = document.createElement('p'); sentenceElement.classList.add('soap-sentence'); sentenceElement.textContent = item.sentence;
                        if (item.mapping && Array.isArray(item.mapping) && item.mapping.length > 0) {
                            sentenceElement.classList.add('has-mapping');
                            sentenceElement.dataset.mapping = JSON.stringify(item.mapping);
                        }
                        sentenceContainer.appendChild(sentenceElement);
                    }
                });
            }
        });
        addMappingListeners(); // Attach listeners after rendering
    }

    // --- Add Mapping Listeners for Hover Dialog ---
    function addMappingListeners() { 
        const mappedElements = soapOutput.querySelectorAll('.has-mapping');
        mappedElements.forEach(element => {
            element.removeEventListener('mouseover', handleMappingMouseOver); element.removeEventListener('mousemove', handleMappingMouseMove); element.removeEventListener('mouseout', handleMappingMouseOut);
            element.addEventListener('mouseover', handleMappingMouseOver); element.addEventListener('mousemove', handleMappingMouseMove); element.addEventListener('mouseout', handleMappingMouseOut);
        });
    }

    // --- Mapping Dialog Event Handlers ---
    function handleMappingMouseOver(event) { 
        const targetElement = event.target; if (!targetElement.classList.contains('has-mapping')) return;
        const mappingString = targetElement.dataset.mapping; if (!mappingString) return;
        try {
            const mappingIndices = JSON.parse(mappingString); if (!Array.isArray(mappingIndices) || mappingIndices.length === 0) return;
            if (!fullTranscriptData || !fullTranscriptData.utterances) { mappingDialog.innerHTML = "Transcript data unavailable."; }
            else {
                let dialogContent = "";
                mappingIndices.forEach(index => {
                    if (fullTranscriptData.utterances[index]) { const u = fullTranscriptData.utterances[index]; dialogContent += `<strong>[Utterance ${index}] Speaker ${u.speaker || '?'}:</strong> ${u.text}\n`; }
                    else { dialogContent += `<strong>[Utterance ${index}]:</strong> (Not found)\n`; }
                });
                mappingDialog.innerHTML = dialogContent.trim();
            }
            positionMappingDialog(event); mappingDialog.style.display = 'block';
            highlightTranscriptUtterance(mappingIndices, true);
        } catch (e) { console.error("Mapping parse error:", e); mappingDialog.innerHTML = "Error displaying source."; mappingDialog.style.display = 'block'; }
    }
    function handleMappingMouseMove(event) { 
        if (mappingDialog.style.display === 'block') positionMappingDialog(event);
    }
    function handleMappingMouseOut(event) { 
        hideMappingDialog();
        const mappingString = event.target.dataset.mapping; if (!mappingString) return;
        try { const mappingIndices = JSON.parse(mappingString); highlightTranscriptUtterance(mappingIndices, false); } catch (e) { }
    }

    // --- Helper to Position Mapping Dialog ---
    function positionMappingDialog(event) { 
        let x = event.pageX + 15; let y = event.pageY + 10;
        const dw = mappingDialog.offsetWidth; const dh = mappingDialog.offsetHeight; const vw = window.innerWidth; const vh = window.innerHeight; const sx = window.scrollX; const sy = window.scrollY;
        if (x + dw > vw + sx) x = event.pageX - dw - 15;
        if (y + dh > vh + sy) y = event.pageY - dh - 10;
        if (x < sx) x = sx + 5; if (y < sy) y = sy + 5;
        mappingDialog.style.left = `${x}px`; mappingDialog.style.top = `${y}px`;
    }
    // --- Helper to Hide Mapping Dialog ---
    function hideMappingDialog() { mappingDialog.style.display = 'none'; }

    // --- Highlighting Function for Transcript ---
    function highlightTranscriptUtterance(indices, shouldHighlight) { 
        if (!Array.isArray(indices)) indices = [indices];
        if (shouldHighlight) { transcriptOutput.querySelectorAll('.utterance.highlighted').forEach(el => el.classList.remove('highlighted')); }
        indices.forEach(index => {
            const utteranceDiv = transcriptOutput.querySelector(`.utterance[data-utterance-index="${index}"]`);
            if (utteranceDiv) { if (shouldHighlight) utteranceDiv.classList.add('highlighted'); else utteranceDiv.classList.remove('highlighted'); }
        });
    }

    // --- Update Current Time ---
    function updateTime() { currentTimeDisplay.textContent = new Date().toLocaleTimeString(); }
    setInterval(updateTime, 1000); updateTime();

    // --- Initial Setup ---
    setupMediaRecorder();
    disableStopButton();
    disableDevControls(); // Dev controls disabled initially until toggled

}); // End DOMContentLoaded