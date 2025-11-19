
import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import { MoodState, VisualConfig, SpotifyState } from '../types';
import { audioManager } from '../services/audioService';

interface SceneProps {
  mood: MoodState;
  visualConfig?: VisualConfig;
  isAudioActive: boolean;
  spotifyState: SpotifyState;
  isMobileMenuOpen: boolean;
}

const Scene: React.FC<SceneProps> = ({ 
  mood, 
  visualConfig, 
  isAudioActive,
  spotifyState,
  isMobileMenuOpen
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const stateRef = useRef({ mood, visualConfig, isAudioActive, spotifyState, isMobileMenuOpen });

  useEffect(() => {
    stateRef.current = { mood, visualConfig, isAudioActive, spotifyState, isMobileMenuOpen };
  }, [mood, visualConfig, isAudioActive, spotifyState, isMobileMenuOpen]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
    }

    const sketch = (p: p5) => {
      let timeOffset = 0;
      let hueOffset = 0; // Persistent hue for audio reactivity
      
      let smoothBass = 0;
      let smoothMid = 0;
      let smoothTreble = 0;
      
      // For Spotify-only mode simulation
      let simulatedBeat = 0;
      
      // Particle System for Background
      const particles: any[] = [];
      const numParticles = 80;

      p.setup = () => {
        if (!containerRef.current) return;
        p.createCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
        p.frameRate(60);
        
        // Init particles
        for(let i=0; i<numParticles; i++) {
            particles.push({
                x: p.random(p.width),
                y: p.random(p.height),
                z: p.random(0.5, 2),
                size: p.random(1, 3)
            });
        }
      };

      p.windowResized = () => {
        if (containerRef.current) {
          p.resizeCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
        }
      };

      const getNoiseRadius = (angle: number, time: number, seed: number, intensity: number, irregularity: number) => {
        const noiseScale = 1.2; 
        const xoff = p.map(Math.cos(angle), -1, 1, 0, noiseScale);
        const yoff = p.map(Math.sin(angle), -1, 1, 0, noiseScale);
        const n = p.noise(xoff + seed, yoff + seed, time);
        return p.map(n, 0, 1, -intensity * irregularity, intensity * irregularity);
      };

      p.draw = () => {
        const state = stateRef.current;
        p.clear();

        let bass = 0.05, mid = 0.05, treble = 0.05;

        // --- INPUT HANDLING ---
        if (state.isAudioActive) {
           // MODE 1: REAL MICROPHONE
           const audioData = audioManager.getAnalysis();
           bass = audioData.bass;
           mid = audioData.mid;
           treble = audioData.treble;
        } 
        else if (state.spotifyState.isPlaying && state.spotifyState.features) {
           // MODE 2: SPOTIFY SIMULATION
           const bpm = state.spotifyState.features.tempo;
           const energy = state.spotifyState.features.energy;
           
           const bps = bpm / 60;
           const msPerBeat = 1000 / bps;
           const now = p.millis();
           
           // Create a kick drum envelope
           const beatPhase = (now % msPerBeat) / msPerBeat;
           // Sharp attack, expo decay
           const kick = Math.pow(1 - beatPhase, 4) * energy; 
           
           simulatedBeat = p.lerp(simulatedBeat, kick, 0.2);
           
           bass = 0.1 + (simulatedBeat * 0.6);
           mid = 0.1 + (energy * 0.2);
           treble = 0.05 + (energy * 0.1);
        }
        else {
           // MODE 3: IDLE
           const idlePulse = (Math.sin(p.millis() / 1000) + 1) * 0.5;
           bass = 0.1 + (idlePulse * 0.05);
        }

        // Smoothing
        smoothBass = p.lerp(smoothBass, bass, 0.15);
        smoothMid = p.lerp(smoothMid, mid, 0.1);
        smoothTreble = p.lerp(smoothTreble, treble, 0.1);

        // --- COLOR LOGIC ---
        let cPrimary: p5.Color;
        let cSecondary: p5.Color;

        if (state.isAudioActive) {
            // Dynamic HSB Coloring
            // We explicitly set max alpha to 255 to ensure consistency with RGB mode
            p.colorMode(p.HSB, 360, 100, 100, 255);
            
            // Hue cycles continuously but jumps forward on bass hits
            hueOffset += 0.2 + (smoothBass * 3.0); 
            const h = hueOffset % 360;
            const s = 50 + (smoothMid * 50);     // Mid tones drive saturation
            const b = 80 + (smoothBass * 20);    // Bass drives brightness
            
            cPrimary = p.color(h, s, Math.min(b, 100));
            // Complementary accent
            cSecondary = p.color((h + 180) % 360, s * 0.8, b * 0.6);
        } else {
            // Static/Spotify Coloring
            p.colorMode(p.RGB, 255);
            const baseColorHex = state.visualConfig?.primaryColor || '#8b5cf6';
            cPrimary = p.color(baseColorHex);
            cSecondary = p.color(baseColorHex);
            cSecondary.setAlpha(100);
        }

        // Capture the string representation before pushing state for particles
        const primaryColorStr = cPrimary.toString();

        // @ts-ignore
        const ctx = p.drawingContext as CanvasRenderingContext2D;

        const cx = p.width / 2;
        const cy = p.height / 2;
        const minDim = Math.min(p.width, p.height);
        const baseRadius = minDim * 0.20;
        const expansion = smoothBass * (minDim * 0.2);
        
        timeOffset += 0.01 + (smoothBass * 0.05);

        // --- PARTICLE SYSTEM (BACKGROUND) ---
        p.push();
        // Force RGB mode for consistent alpha handling regardless of main visualizer mode
        p.colorMode(p.RGB, 255);
        p.noStroke();
        
        // Create color from the primary string
        let particleColor = p.color(primaryColorStr);
        
        // Set alpha: Base 50 (approx 20%) + Bass boost up to +150
        const particleAlpha = 50 + (smoothBass * 150);
        particleColor.setAlpha(Math.min(particleAlpha, 255));
        
        p.fill(particleColor);

        for (let i = 0; i < numParticles; i++) {
            let part = particles[i];
            
            // Move particles
            // Very slow drift (0.02) + bass burst
            part.y -= part.z * (0.02 + (smoothBass * 2.0)); 
            
            // Wrap around
            if (part.y < 0) {
                part.y = p.height;
                part.x = p.random(p.width);
            }
            
            // Render square pixels for retro look
            const size = part.size * (1 + smoothBass);
            p.rect(part.x, part.y, size, size);
        }
        p.pop();

        // --- VISUALIZER SETUP ---
        p.translate(cx, cy);
        const volatility = 30 + (smoothMid * 100) + (smoothTreble * 150);

        // --- PROGRESS RING (ORGANIC) ---
        // Logic: Show if Desktop OR (Mobile AND Menu Closed)
        const isMobile = p.width < 768;
        const showRing = !isMobile || (isMobile && !state.isMobileMenuOpen);

        if (state.spotifyState.isPlaying && state.spotifyState.currentTrack && showRing) {
            const duration = state.spotifyState.currentTrack.duration_ms;
            const progress = state.spotifyState.progress_ms;
            const progressRatio = Math.min(progress / duration, 1.0);
            const ringRadius = baseRadius * 2.0;

            // Background Track (Ghost)
            p.noFill();
            
            // Use PRIMARY color for the ghost track to ensure it matches the visualizer theme.
            // Previously this used secondary/complementary which looked 'weird' or mismatched.
            let trackColor = p.color(cPrimary.toString());
            
            // Set consistent low opacity (0-255 scale)
            trackColor.setAlpha(50); 
            
            p.stroke(trackColor);
            p.strokeWeight(2);
            ctx.shadowBlur = 0;

            p.beginShape();
            for (let a = -p.PI/2; a < p.TWO_PI - p.PI/2; a += 0.1) {
                // Deform based on noise so it's not a perfect circle
                const off = getNoiseRadius(a, timeOffset * 0.5, 200, 20, 1);
                const r = ringRadius + off;
                p.vertex(r * Math.cos(a), r * Math.sin(a));
            }
            p.endShape(p.CLOSE);

            // Active Progress (Bright)
            const endAngle = -p.PI/2 + (progressRatio * p.TWO_PI);
            p.stroke(cPrimary);
            p.strokeWeight(4);
            ctx.shadowBlur = 15;
            ctx.shadowColor = cPrimary.toString();

            p.beginShape();
            for (let a = -p.PI/2; a <= endAngle; a += 0.05) {
                 const off = getNoiseRadius(a, timeOffset * 0.5, 200, 20 + (smoothBass * 10), 1);
                 const r = ringRadius + off;
                 p.vertex(r * Math.cos(a), r * Math.sin(a));
            }
            p.endShape();
        }

        // --- MAIN BLOB ---
        // 1. Outer Echo Ring
        p.noFill();
        p.strokeWeight(1);
        
        // Use primary color
        let echoColor = p.color(cPrimary.toString());
        
        // Alpha handling - consistent 0-255 scale
        const echoAlpha = state.isAudioActive ? 60 : 100; 
        echoColor.setAlpha(echoAlpha * smoothMid);
        
        p.stroke(echoColor);
        ctx.shadowBlur = 0;
        
        p.beginShape();
        for (let a = 0; a <= p.TWO_PI; a += 0.1) {
            const r = (baseRadius * 1.5) + expansion + getNoiseRadius(a, timeOffset * 0.5, 100, volatility * 0.5, 1);
            p.vertex(r * Math.cos(a), r * Math.sin(a));
        }
        p.endShape(p.CLOSE);

        // 2. Main Blob
        p.strokeWeight(4 + (smoothBass * 6));
        p.stroke(cPrimary);
        p.noFill();
        
        ctx.shadowBlur = 20 + (smoothBass * 40);
        ctx.shadowColor = cPrimary.toString();

        p.beginShape();
        for (let a = 0; a <= p.TWO_PI; a += 0.05) {
            const rOffset = getNoiseRadius(a, timeOffset, 0, volatility, 1 + smoothTreble);
            const r = baseRadius + expansion + rOffset;
            p.vertex(r * Math.cos(a), r * Math.sin(a));
        }
        p.endShape(p.CLOSE);

        // 3. Center Core
        if (smoothTreble > 0.1) {
            p.fill(cPrimary);
            p.noStroke();
            ctx.shadowBlur = 50;
            const coreSize = (baseRadius * 0.3) * smoothTreble;
            p.circle(0, 0, coreSize);
        }
      };
    };

    const P5 = (p5 as any).default || p5;
    // @ts-ignore
    p5InstanceRef.current = new P5(sketch, containerRef.current);

    return () => {
      if (p5InstanceRef.current) p5InstanceRef.current.remove();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black overflow-hidden">
        {/* RETRO GRID OVERLAY */}
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
    </div>
  );
};

export default Scene;
