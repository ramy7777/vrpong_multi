export class SoundManager {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {
            // Player paddle hit: bright, high-pitched ping (E5)
            paddleHit: this.createSound({
                midiNote: 76,
                duration: 0.1,
                waveform: 'triangle',
                attack: 0.01,
                decay: 0.1,
                gain: 0.3
            }),

            // Wall bounce: sharp click (B5) - shorter and crisper
            wallBounce: this.createSound({
                midiNote: 83,
                duration: 0.05,
                waveform: 'square',
                attack: 0.001,
                decay: 0.05,
                gain: 0.15
            }),

            // Score: triumphant chord (C major arpeggio)
            score: this.createChord([60, 64, 67, 72], 0.4),

            // AI hit: metallic sound (A4)
            aiHit: this.createSound({
                midiNote: 69,
                duration: 0.1,
                waveform: 'square',
                attack: 0.01,
                decay: 0.1,
                gain: 0.2
            }),

            // Miss sound: descending notes
            miss: this.createDescendingNotes([67, 64, 60], 0.3),

            // Point sound: ascending notes
            point: this.createAscendingNotes([60, 64, 67], 0.3),

            // Lose sound: quick descending minor third with vibrato
            lose: this.createSound({
                midiNote: 70,  // Bb4
                duration: 0.25,
                waveform: 'sawtooth',
                attack: 0.01,
                decay: 0.25,
                gain: 0.25,
                pitchBend: {
                    endNote: 65,  // F4
                    time: 0.25
                },
                vibrato: {
                    frequency: 12,
                    amplitude: 10
                }
            }),

            // Background music: progressive synth pattern
            backgroundMusic: this.createProgressiveMusic()
        };
        
        // Keep track of background music state
        this.backgroundMusicPlaying = false;
        this.currentMusicLoop = null;
    }

    // Convert MIDI note number to frequency
    midiToFreq(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    createSound({ midiNote, duration, waveform, attack, decay, gain, pitchBend, vibrato }) {
        const startFreq = this.midiToFreq(midiNote);
        
        return {
            play: () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                
                const osc = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                // Set oscillator properties
                osc.type = waveform;
                osc.frequency.setValueAtTime(startFreq, this.audioContext.currentTime);
                
                // Add pitch bend if specified
                if (pitchBend) {
                    const endFreq = this.midiToFreq(pitchBend.endNote);
                    osc.frequency.linearRampToValueAtTime(endFreq, this.audioContext.currentTime + pitchBend.time);
                }

                // Add vibrato if specified
                if (vibrato) {
                    const vibratoOsc = this.audioContext.createOscillator();
                    const vibratoGain = this.audioContext.createGain();
                    
                    vibratoOsc.frequency.value = vibrato.frequency;
                    vibratoGain.gain.value = vibrato.amplitude;
                    
                    vibratoOsc.connect(vibratoGain);
                    vibratoGain.connect(osc.frequency);
                    
                    vibratoOsc.start();
                    vibratoOsc.stop(this.audioContext.currentTime + duration);
                }
                
                // Create envelope
                gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(gain, this.audioContext.currentTime + attack);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                
                // Connect nodes
                osc.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                // Play sound
                osc.start();
                osc.stop(this.audioContext.currentTime + duration);
            }
        };
    }

    createChord(midiNotes, duration) {
        return {
            play: () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }

                // Create master gain
                const masterGain = this.audioContext.createGain();
                masterGain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
                masterGain.connect(this.audioContext.destination);

                // Play each note with slight delay for arpeggio effect
                midiNotes.forEach((note, index) => {
                    setTimeout(() => {
                        const osc = this.audioContext.createOscillator();
                        const gainNode = this.audioContext.createGain();
                        
                        const frequency = this.midiToFreq(note);
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                        
                        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.02);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration - 0.1);
                        
                        osc.connect(gainNode);
                        gainNode.connect(masterGain);
                        
                        osc.start();
                        osc.stop(this.audioContext.currentTime + duration);
                    }, index * 50); // 50ms delay between notes
                });
            }
        };
    }

    createDescendingNotes(midiNotes, duration) {
        return {
            play: () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }

                const masterGain = this.audioContext.createGain();
                masterGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                masterGain.connect(this.audioContext.destination);

                midiNotes.forEach((note, index) => {
                    setTimeout(() => {
                        const osc = this.audioContext.createOscillator();
                        const gainNode = this.audioContext.createGain();
                        
                        const frequency = this.midiToFreq(note);
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                        
                        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.02);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
                        
                        osc.connect(gainNode);
                        gainNode.connect(masterGain);
                        
                        osc.start();
                        osc.stop(this.audioContext.currentTime + 0.2);
                    }, index * 100);
                });
            }
        };
    }

    createAscendingNotes(midiNotes, duration) {
        return {
            play: () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }

                const masterGain = this.audioContext.createGain();
                masterGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                masterGain.connect(this.audioContext.destination);

                midiNotes.forEach((note, index) => {
                    setTimeout(() => {
                        const osc = this.audioContext.createOscillator();
                        const gainNode = this.audioContext.createGain();
                        
                        const frequency = this.midiToFreq(note);
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                        
                        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.02);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
                        
                        osc.connect(gainNode);
                        gainNode.connect(masterGain);
                        
                        osc.start();
                        osc.stop(this.audioContext.currentTime + 0.2);
                    }, index * 100);
                });
            }
        };
    }

    createProgressiveMusic() {
        const bassline = [36, 36, 43, 41]; // C2, C2, G2, F2
        const melody = [60, 64, 67, 69];   // C4, E4, G4, A4
        const baseNoteDuration = 0.3;  // Increased from 0.2 to 0.3 for slower pace
        const baseNoteGap = 0.15;      // Increased from 0.1 to 0.15 for slower pace
        let currentSpeed = 1.0;
        
        return {
            play: () => {
                if (this.backgroundMusicPlaying) return;
                this.backgroundMusicPlaying = true;
                
                const playNote = (noteIndex) => {
                    if (!this.backgroundMusicPlaying) return;
                    
                    // Calculate current duration based on speed
                    const duration = baseNoteDuration / currentSpeed;
                    const noteGap = baseNoteGap / currentSpeed;
                    
                    // Play bassline
                    const bassOsc = this.audioContext.createOscillator();
                    const bassGain = this.audioContext.createGain();
                    bassOsc.connect(bassGain);
                    bassGain.connect(this.audioContext.destination);
                    
                    bassOsc.type = 'sawtooth';
                    bassOsc.frequency.value = this.midiToFreq(bassline[noteIndex]);
                    bassGain.gain.value = 0.15;
                    
                    bassOsc.start();
                    bassGain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                    bassOsc.stop(this.audioContext.currentTime + duration);
                    
                    // Play melody
                    const melodyOsc = this.audioContext.createOscillator();
                    const melodyGain = this.audioContext.createGain();
                    melodyOsc.connect(melodyGain);
                    melodyGain.connect(this.audioContext.destination);
                    
                    melodyOsc.type = 'sine';
                    melodyOsc.frequency.value = this.midiToFreq(melody[noteIndex]);
                    melodyGain.gain.value = 0.1;
                    
                    melodyOsc.start();
                    melodyGain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                    melodyOsc.stop(this.audioContext.currentTime + duration);
                    
                    // Schedule next note
                    if (this.backgroundMusicPlaying) {
                        this.currentMusicLoop = setTimeout(() => {
                            playNote((noteIndex + 1) % bassline.length);
                        }, (duration + noteGap) * 1000);
                    }
                };
                
                playNote(0);
            },
            stop: () => {
                this.backgroundMusicPlaying = false;
                if (this.currentMusicLoop) {
                    clearTimeout(this.currentMusicLoop);
                    this.currentMusicLoop = null;
                }
            },
            setSpeed: (speed) => {
                currentSpeed = Math.max(1.0, Math.min(3.0, speed)); // Clamp between 1.0 and 3.0
            }
        };
    }
    
    startBackgroundMusic() {
        this.sounds.backgroundMusic.play();
    }
    
    stopBackgroundMusic() {
        this.sounds.backgroundMusic.stop();
    }

    updateMusicSpeed(speed) {
        if (this.sounds.backgroundMusic) {
            this.sounds.backgroundMusic.setSpeed(speed);
        }
    }

    playPaddleHit() {
        this.sounds.paddleHit.play();
    }

    playWallBounce() {
        this.sounds.wallBounce.play();
    }

    playScore() {
        this.sounds.score.play();
    }

    playAIHit() {
        this.sounds.aiHit.play();
    }

    playMiss() {
        this.sounds.miss.play();
    }

    playPoint() {
        this.sounds.point.play();
    }

    playLose() {
        this.sounds.lose.play();
    }
}
