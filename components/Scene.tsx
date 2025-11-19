
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
  onSeek: (percentage: number) => void;
}

const Scene: React.FC<SceneProps> = ({ 
  mood, 
  visualConfig, 
  isAudioActive,
  spotifyState,
  isMobileMenuOpen,
  onSeek
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
      let hueOffset = 0; 
      
      let smoothBass = 0;
      let smoothMid = 0;
      let smoothTreble = 0;
      
      let simulatedBeat = 0;
      
      const particles: any[] = [];
      const numParticles = 80;

      p.setup = () => {
        if (!containerRef.current) return;
        p.createCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
        p.frameRate(60);
        
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

      // Interaction for Seeking
      p.mousePressed = () => {
        const state = stateRef.current;
        const cx = p.width / 2;
        const cy = p.height / 2;
        const minDim = Math.min(p.width, p.height);
        const baseRadius = minDim * 0.20;
        const ringRadius = baseRadius * 2.0;
        
        // Calculate distance from center
        const d = p.dist(p.mouseX, p.mouseY, cx, cy);
        
        // Allow clicking near the ring (with some tolerance)
        if (d > ringRadius * 0.8 && d < ringRadius * 1.2) {
            let angle = p.atan2(p.mouseY - cy, p.mouseX - cx);
            // Normalize angle to 0 - TWO_PI starting from -PI/2 (12 o'clock)
            // Standard atan2: -PI to PI. -PI/2 is up.
            
            let correctedAngle = angle + p.PI/2;
            if (correctedAngle < 0) correctedAngle += p.TWO_PI;
            
            const percentage = correctedAngle / p.TWO_PI;
            onSeek(percentage);
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

        if (state.isAudioActive) {
           const audioData = audioManager.getAnalysis();
           bass = audioData.bass;
           mid = audioData.mid;
           treble = audioData.treble;
        } 
        else if (state.spotifyState.isPlaying && state.spotifyState.features) {
           const bpm = state.spotifyState.features.tempo;
           const energy = state.spotifyState.features.energy;
           
           const bps = bpm / 60;
           const msPerBeat = 1000 / bps;
           const now = p.millis();
           
           const beatPhase = (now % msPerBeat) / msPerBeat;
           const kick = Math.pow(1 - beatPhase, 4) * energy; 
           
           simulatedBeat = p.lerp(simulatedBeat, kick, 0.2);
           
           bass = 0.1 + (simulatedBeat * 0.6);
           mid = 0.1 + (energy * 0.2);
           treble = 0.05 + (energy * 0.1);
        }
        else {
           const idlePulse = (Math.sin(p.millis() / 1000) + 1) * 0.5;
           bass = 0.1 + (idlePulse * 0.05);
        }

        smoothBass = p.lerp(smoothBass, bass, 0.15);
        smoothMid = p.lerp(smoothMid, mid, 0.1);
        smoothTreble = p.lerp(smoothTreble, treble, 0.1);

        let cPrimary: p5.Color;

        if (state.isAudioActive) {
            p.colorMode(p.HSB, 360, 100, 100, 255);
            
            hueOffset += 0.2 + (smoothBass * 3.0); 
            const h = hueOffset % 360;
            const s = 50 + (smoothMid * 50);     
            const b = 80 + (smoothBass * 20);    
            
            cPrimary = p.color(h, s, Math.min(b, 100));
        } else {
            p.colorMode(p.RGB, 255);
            const baseColorHex = state.visualConfig?.primaryColor || '#8b5cf6';
            cPrimary = p.color(baseColorHex);
        }

        const primaryColorStr = cPrimary.toString();
        // @ts-ignore
        const ctx = p.drawingContext as CanvasRenderingContext2D;

        const cx = p.width / 2;
        const cy = p.height / 2;
        const minDim = Math.min(p.width, p.height);
        const baseRadius = minDim * 0.20;
        const expansion = smoothBass * (minDim * 0.2);
        
        timeOffset += 0.01 + (smoothBass * 0.05);

        // --- PARTICLES ---
        p.push();
        p.colorMode(p.RGB, 255);
        p.noStroke();
        
        // Use hex string to force RGB interpretation for particles to avoid HSB scaling issues
        let particleColor = p.color(state.visualConfig?.primaryColor || '#8b5cf6');
        if (state.isAudioActive) {
            // For HSB mode, convert the dynamic color to RGB string then back to color object inside this RGB context
            // Or simpler: just use a white/grey tint for stars in HSB mode to be safe
            particleColor = p.color(255, 255, 255);
        }
        
        const particleAlpha = 50 + (smoothBass * 150);
        particleColor.setAlpha(Math.min(particleAlpha, 255));
        
        p.fill(particleColor);

        for (let i = 0; i < numParticles; i++) {
            let part = particles[i];
            part.y -= part.z * (0.02 + (smoothBass * 2.0)); 
            
            if (part.y < 0) {
                part.y = p.height;
                part.x = p.random(p.width);
            }
            
            const size = part.size * (1 + smoothBass);
            p.rect(part.x, part.y, size, size);
        }
        p.pop();

        p.translate(cx, cy);
        const volatility = 30 + (smoothMid * 100) + (smoothTreble * 150);

        // --- PROGRESS RING ---
        const isMobile = p.width < 768;
        const showRing = !isMobile || (isMobile && !state.isMobileMenuOpen);
        
        // Determine track validity based on platform
        const isTrackPlaying = state.spotifyState.activeSource === 'SPOTIFY' 
            ? (state.spotifyState.isPlaying && !!state.spotifyState.currentTrack)
            : (state.spotifyState.isPlaying && !!state.spotifyState.youtubeTrack);

        if (isTrackPlaying && showRing) {
            let duration = 1;
            let progress = 0;

            if (state.spotifyState.activeSource === 'SPOTIFY' && state.spotifyState.currentTrack) {
                 duration = state.spotifyState.currentTrack.duration_ms;
                 progress = state.spotifyState.progress_ms;
            } else if (state.spotifyState.activeSource === 'YOUTUBE' && state.spotifyState.youtubeTrack) {
                 duration = state.spotifyState.youtubeTrack.duration_ms || 240000;
                 progress = state.spotifyState.progress_ms;
            }

            const progressRatio = Math.min(progress / duration, 1.0);
            const ringRadius = baseRadius * 2.0;

            // Ghost Track
            p.noFill();
            
            // Ensure consistent color mode interpretation
            // We use cPrimary which is already computed in correct mode (RGB or HSB)
            let trackColor = p.color(cPrimary.toString());
            
            // In HSB mode (360, 100, 100, 255), setAlpha(50) works same as RGB
            trackColor.setAlpha(40); 
            
            p.stroke(trackColor);
            p.strokeWeight(2);
            ctx.shadowBlur = 0;

            p.beginShape();
            for (let a = -p.PI/2; a < p.TWO_PI - p.PI/2; a += 0.1) {
                const off = getNoiseRadius(a, timeOffset * 0.5, 200, 20, 1);
                const r = ringRadius + off;
                p.vertex(r * Math.cos(a), r * Math.sin(a));
            }
            p.endShape(p.CLOSE);

            // Active Progress
            const endAngle = -p.PI/2 + (progressRatio * p.TWO_PI);
            p.stroke(cPrimary);
            p.strokeWeight(4);
            ctx.shadowBlur = 15;
            ctx.shadowColor = cPrimary.toString();

            p.beginShape();
            // Loop with small steps to make noise continuous
            if (progressRatio >= 0.99) {
                for (let a = -p.PI/2; a <= p.TWO_PI - p.PI/2; a += 0.05) {
                    const off = getNoiseRadius(a, timeOffset * 0.5, 200, 20 + (smoothBass * 10), 1);
                    const r = ringRadius + off;
                    p.vertex(r * Math.cos(a), r * Math.sin(a));
                }
                p.endShape(p.CLOSE);
            } else {
                for (let a = -p.PI/2; a <= endAngle; a += 0.05) {
                     const off = getNoiseRadius(a, timeOffset * 0.5, 200, 20 + (smoothBass * 10), 1);
                     const r = ringRadius + off;
                     p.vertex(r * Math.cos(a), r * Math.sin(a));
                }
                p.endShape();
            }
        }

        // --- MAIN VISUALIZER ---
        p.noFill();
        p.strokeWeight(1);
        
        let echoColor = p.color(cPrimary.toString());
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
    <div ref={containerRef} className="w-full h-full relative bg-black overflow-hidden cursor-pointer" title="Click ring to seek">
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
    </div>
  );
};

export default Scene;
