// Main Application
class VideoEditor {
    constructor() {
        this.videoElement = document.getElementById('video-preview');
        this.canvasElement = document.getElementById('video-canvas');
        this.ctx = this.canvasElement.getContext('2d');
        this.textOverlaysContainer = document.getElementById('text-overlays-container');
        this.timeDisplay = document.getElementById('time-display');
        this.playhead = document.getElementById('playhead');
        this.videoClip = document.getElementById('video-clip');
        this.audioClip = document.getElementById('audio-clip');
        this.trimStart = document.getElementById('trim-start');
        this.trimEnd = document.getElementById('trim-end');
        this.playBtn = document.getElementById('play-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.exportModal = document.getElementById('export-modal');
        this.startExportBtn = document.getElementById('start-export');
        this.exportProgress = document.querySelector('.progress');
        this.exportResult = document.getElementById('export-result');
        this.dropZone = document.getElementById('drop-zone');
        
        // Video state
        this.videoFile = null;
        this.videoUrl = null;
        this.videoDuration = 0;
        this.currentTime = 0;
        this.isPlaying = false;
        this.animationFrameId = null;
        
        // Audio state
        this.audioFile = null;
        this.audioUrl = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioGain = null;
        
        // Text overlays
        this.textOverlays = [];
        this.selectedOverlay = null;
        
        // FFmpeg
        this.ffmpeg = null;
        this.loadFFmpeg();
        
        // Initialize
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateTimeDisplay();
    }
    
    // Load FFmpeg.wasm
    async loadFFmpeg() {
        const { createFFmpeg, fetchFile } = FFmpeg;
        this.ffmpeg = createFFmpeg({ 
            log: true,
            corePath: 'assets/ffmpeg-core.js'
        });
        
        try {
            await this.ffmpeg.load();
            console.log('FFmpeg loaded successfully');
        } catch (error) {
            console.error('Error loading FFmpeg:', error);
        }
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Video upload
        document.getElementById('upload-video').addEventListener('click', () => {
            document.getElementById('video-input').click();
        });
        
        document.getElementById('video-input').addEventListener('change', (e) => {
            this.handleVideoUpload(e.target.files[0]);
        });
        
        // Audio upload
        document.getElementById('upload-audio').addEventListener('click', () => {
            document.getElementById('audio-input').click();
        });
        
        document.getElementById('audio-input').addEventListener('change', (e) => {
            this.handleAudioUpload(e.target.files[0]);
        });
        
        // Play/pause
        this.playBtn.addEventListener('click', () => {
            this.togglePlayback();
        });
        
        // Timeline scrubbing
        this.trimStart.addEventListener('input', () => {
            this.updateTrimPositions();
        });
        
        this.trimEnd.addEventListener('input', () => {
            this.updateTrimPositions();
        });
        
        // Text overlay
        document.getElementById('add-text').addEventListener('click', () => {
            this.addTextOverlay();
        });
        
        // Export
        this.exportBtn.addEventListener('click', () => {
            this.showExportModal();
        });
        
        this.startExportBtn.addEventListener('click', () => {
            this.exportVideo();
        });
        
        // Modal close
        document.querySelector('.close').addEventListener('click', () => {
            this.exportModal.style.display = 'none';
        });
        
        // Window click to close modal
        window.addEventListener('click', (e) => {
            if (e.target === this.exportModal) {
                this.exportModal.style.display = 'none';
            }
        });
        
        // Video time update
        this.videoElement.addEventListener('timeupdate', () => {
            this.currentTime = this.videoElement.currentTime;
            this.updateTimeDisplay();
            this.updatePlayheadPosition();
        });
        
        this.videoElement.addEventListener('loadedmetadata', () => {
            this.videoDuration = this.videoElement.duration;
            this.updateTimeDisplay();
            this.setupCanvas();
            this.updateVideoClipDisplay();
        });
        
        this.videoElement.addEventListener('ended', () => {
            this.stopPlayback();
        });
    }
    
    // Setup drag and drop
    setupDragAndDrop() {
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('active');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('active');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('active');
            
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('video/')) {
                this.handleVideoUpload(file);
            } else if (file.type.startsWith('audio/')) {
                this.handleAudioUpload(file);
            }
        });
    }
    
    // Handle video upload
    async handleVideoUpload(file) {
        if (!file) return;
        
        this.videoFile = file;
        
        // Release previous video URL if exists
        if (this.videoUrl) {
            URL.revokeObjectURL(this.videoUrl);
        }
        
        this.videoUrl = URL.createObjectURL(file);
        this.videoElement.src = this.videoUrl;
        this.videoElement.style.display = 'block';
        this.dropZone.style.display = 'none';
        
        // Wait for video to load
        await new Promise((resolve) => {
            this.videoElement.onloadedmetadata = resolve;
        });
        
        this.videoDuration = this.videoElement.duration;
        this.updateVideoProperties();
    }
    
    // Handle audio upload
    async handleAudioUpload(file) {
        if (!file) return;
        
        this.audioFile = file;
        
        // Release previous audio URL if exists
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
        }
        
        this.audioUrl = URL.createObjectURL(file);
        
        // Initialize audio context if not already done
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioGain = this.audioContext.createGain();
            this.audioGain.connect(this.audioContext.destination);
        }
        
        // Stop previous audio if playing
        if (this.audioSource) {
            this.audioSource.stop();
        }
        
        // Create new audio source
        const audioData = await fetch(this.audioUrl).then(r => r.arrayBuffer());
        const audioBuffer = await this.audioContext.decodeAudioData(audioData);
        
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = audioBuffer;
        this.audioSource.connect(this.audioGain);
        
        // Update UI
        this.audioClip.style.display = 'block';
        this.audioClip.style.width = '100%';
        document.getElementById('audio-controls').style.display = 'block';
    }
    
    // Setup canvas for rendering video with overlays
    setupCanvas() {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        this.canvasElement.style.display = 'block';
        this.videoElement.style.display = 'none';
        this.renderFrame();
    }
    
    // Render video frame with overlays
    renderFrame() {
        if (!this.isPlaying && this.currentTime === 0) return;
        
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Render text overlays on canvas if needed
        // (Alternative is to use HTML elements positioned over canvas)
        
        if (this.isPlaying) {
            this.animationFrameId = requestAnimationFrame(() => this.renderFrame());
        }
    }
    
    // Add text overlay
    addTextOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'text-overlay';
        overlay.textContent = 'Double click to edit';
        overlay.style.left = '50%';
        overlay.style.top = '50%';
        overlay.style.transform = 'translate(-50%, -50%)';
        
        // Make draggable
        this.makeDraggable(overlay);
        
        // Select on click
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectOverlay(overlay);
        });
        
        // Double click to edit
        overlay.addEventListener('dblclick', () => {
            const newText = prompt('Enter text:', overlay.textContent);
            if (newText !== null) {
                overlay.textContent = newText;
            }
        });
        
        this.textOverlaysContainer.appendChild(overlay);
        this.textOverlays.push(overlay);
        this.selectOverlay(overlay);
    }
    
    // Make element draggable
    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = (e) => {
            e = e || window.event;
            e.preventDefault();
            
            // Get the mouse cursor position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            document.onmouseup = () => {
                // Stop moving when mouse button is released
                document.onmouseup = null;
                document.onmousemove = null;
            };
            
            document.onmousemove = (e) => {
                e = e || window.event;
                e.preventDefault();
                
                // Calculate the new cursor position
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                
                // Set the element's new position
                const rect = element.getBoundingClientRect();
                const containerRect = this.textOverlaysContainer.getBoundingClientRect();
                
                let newTop = (element.offsetTop - pos2) / containerRect.height * 100;
                let newLeft = (element.offsetLeft - pos1) / containerRect.width * 100;
                
                // Constrain to container bounds
                newTop = Math.max(0, Math.min(newTop, 100));
                newLeft = Math.max(0, Math.min(newLeft, 100));
                
                element.style.top = `${newTop}%`;
                element.style.left = `${newLeft}%`;
                element.style.transform = 'none';
            };
        };
    }
    
    // Select text overlay
    selectOverlay(overlay) {
        // Deselect all
        this.textOverlays.forEach(o => o.classList.remove('selected'));
        
        // Select the clicked one
        overlay.classList.add('selected');
        this.selectedOverlay = overlay;
        
        // Update properties panel
        this.updateElementProperties();
    }
    
    // Update video properties panel
    updateVideoProperties() {
        const propertiesDiv = document.getElementById('video-properties');
        
        if (!this.videoFile) {
            propertiesDiv.innerHTML = '<p>No video loaded</p>';
            return;
        }
        
        propertiesDiv.innerHTML = `
            <div class="property-group">
                <label>Filename</label>
                <p>${this.videoFile.name}</p>
            </div>
            <div class="property-group">
                <label>Duration</label>
                <p>${this.formatTime(this.videoDuration)}</p>
            </div>
            <div class="property-group">
                <label>Resolution</label>
                <p>${this.videoElement.videoWidth} × ${this.videoElement.videoHeight}</p>
            </div>
            <div class="property-group">
                <label>File Size</label>
                <p>${(this.videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
        `;
    }
    
    // Update element properties panel
    updateElementProperties() {
        const propertiesDiv = document.getElementById('element-properties');
        
        if (!this.selectedOverlay) {
            propertiesDiv.innerHTML = '<p>No element selected</p>';
            return;
        }
        
        const style = window.getComputedStyle(this.selectedOverlay);
        
        propertiesDiv.innerHTML = `
            <div class="property-group">
                <label>Text Content</label>
                <input type="text" id="edit-text-content" value="${this.selectedOverlay.textContent}">
            </div>
            <div class="property-group">
                <label>Font Size</label>
                <input type="range" id="edit-text-size" min="10" max="100" value="${parseInt(style.fontSize)}">
            </div>
            <div class="property-group">
                <label>Text Color</label>
                <input type="color" id="edit-text-color" value="${style.color}">
            </div>
            <div class="property-group">
                <label>Position X</label>
                <input type="range" id="edit-text-posx" min="0" max="100" value="${parseFloat(style.left)}">
            </div>
            <div class="property-group">
                <label>Position Y</label>
                <input type="range" id="edit-text-posy" min="0" max="100" value="${parseFloat(style.top)}">
            </div>
            <button id="delete-overlay" class="btn-primary">Delete Overlay</button>
        `;
        
        // Add event listeners for property changes
        document.getElementById('edit-text-content').addEventListener('input', (e) => {
            this.selectedOverlay.textContent = e.target.value;
        });
        
        document.getElementById('edit-text-size').addEventListener('input', (e) => {
            this.selectedOverlay.style.fontSize = `${e.target.value}px`;
        });
        
        document.getElementById('edit-text-color').addEventListener('input', (e) => {
            this.selectedOverlay.style.color = e.target.value;
        });
        
        document.getElementById('edit-text-posx').addEventListener('input', (e) => {
            this.selectedOverlay.style.left = `${e.target.value}%`;
            this.selectedOverlay.style.transform = 'none';
        });
        
        document.getElementById('edit-text-posy').addEventListener('input', (e) => {
            this.selectedOverlay.style.top = `${e.target.value}%`;
            this.selectedOverlay.style.transform = 'none';
        });
        
        document.getElementById('delete-overlay').addEventListener('click', () => {
            this.textOverlays = this.textOverlays.filter(o => o !== this.selectedOverlay);
            this.selectedOverlay.remove();
            this.selectedOverlay = null;
            this.updateElementProperties();
        });
    }
    
    // Toggle video playback
    togglePlayback() {
        if (this.isPlaying) {
            this.pausePlayback();
        } else {
            this.startPlayback();
        }
    }
    
    // Start video playback
    startPlayback() {
        if (!this.videoFile) return;
        
        this.isPlaying = true;
        this.videoElement.play();
        
        // Start audio if available
        if (this.audioSource && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        if (this.audioSource && !this.audioSourceStarted) {
            this.audioSource.start(0, this.currentTime);
            this.audioSourceStarted = true;
        }
        
        this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        this.renderFrame();
    }
    
    // Pause video playback
    pausePlayback() {
        this.isPlaying = false;
        this.videoElement.pause();
        
        // Pause audio context
        if (this.audioContext) {
            this.audioContext.suspend();
        }
        
        this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        cancelAnimationFrame(this.animationFrameId);
    }
    
    // Stop video playback
    stopPlayback() {
        this.pausePlayback();
        this.videoElement.currentTime = 0;
        this.currentTime = 0;
        this.updateTimeDisplay();
        this.updatePlayheadPosition();
    }
    
    // Update time display
    updateTimeDisplay() {
        this.timeDisplay.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.videoDuration)}`;
    }
    
    // Format time as MM:SS
    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Update playhead position
    updatePlayheadPosition() {
        if (!this.videoDuration) return;
        
        const percentage = (this.currentTime / this.videoDuration) * 100;
        this.playhead.style.left = `${percentage}%`;
    }
    
    // Update video clip display in timeline
    updateVideoClipDisplay() {
        if (!this.videoDuration) return;
        
        this.videoClip.style.width = '100%';
    }
    
    // Update trim positions
    updateTrimPositions() {
        // For now just update the UI, actual trimming happens during export
        const start = this.trimStart.value;
        const end = this.trimEnd.value;
        
        this.videoClip.style.left = `${start}%`;
        this.videoClip.style.width = `${end - start}%`;
    }
    
    // Show export modal
    showExportModal() {
        if (!this.videoFile) {
            alert('Please upload a video first');
            return;
        }
        
        this.exportModal.style.display = 'flex';
        this.exportProgress.style.width = '0%';
        this.exportResult.innerHTML = '';
    }
    
    // Export video
    async exportVideo() {
        if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
            alert('FFmpeg is still loading, please try again in a moment');
            return;
        }
        
        const resolution = document.getElementById('export-resolution').value;
        const format = document.getElementById('export-format').value;
        const quality = document.getElementById('export-quality').value;
        
        this.startExportBtn.disabled = true;
        this.exportProgress.style.width = '0%';
        
        try {
            // Write video file to FFmpeg's virtual file system
            this.ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(this.videoFile));
            
            // Build FFmpeg command
            let command = [
                '-i', 'input.mp4',
                '-vf', `scale=-2:${resolution}`,
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', String(31 - quality * 3), // Lower CRF = higher quality
                '-movflags', '+faststart'
            ];
            
            // Add audio if available
            if (this.audioFile) {
                this.ffmpeg.FS('writeFile', 'audio.mp3', await fetchFile(this.audioFile));
                command.push('-i', 'audio.mp3', '-c:a', 'aac', '-b:a', '192k');
            }
            
            // Add trim if set
            const start = this.trimStart.value / 100 * this.videoDuration;
            const end = this.trimEnd.value / 100 * this.videoDuration;
            
            if (start > 0 || end < 100) {
                command.push('-ss', String(start), '-to', String(end));
            }
            
            // Output file
            const outputFile = `output.${format}`;
            command.push(outputFile);
            
            // Run FFmpeg
            await this.ffmpeg.run(...command);
            
            // Read the result
            const data = this.ffmpeg.FS('readFile', outputFile);
            
            // Create download link
            const blob = new Blob([data.buffer], { type: `video/${format}` });
            const url = URL.createObjectURL(blob);
            
            this.exportResult.innerHTML = `
                <p>Export complete!</p>
                <a href="${url}" download="edited_video.${format}" class="btn-primary">Download Video</a>
            `;
            
            this.exportProgress.style.width = '100%';
        } catch (error) {
            console.error('Export error:', error);
            this.exportResult.innerHTML = `<p class="error">Export failed: ${error.message}</p>`;
        } finally {
            this.startExportBtn.disabled = false;
        }
    }
}

// Helper function to fetch file as Uint8Array
async function fetchFile(file) {
    return new Uint8Array(await file.arrayBuffer());
}

// Initialize the editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const editor = new VideoEditor();
});
