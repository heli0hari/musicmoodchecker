import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import { MoodState } from '../types';

interface SceneProps {
  mood: MoodState;
  tempo: number;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  showProgressRing?: boolean;
}

const Scene: React.FC<SceneProps> = ({ mood, tempo, isPlaying, progressMs, durationMs, showProgressRing = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const stateRef = useRef({ mood, tempo, isPlaying, progressMs, durationMs, showProgressRing });

  // Keep refs up to date
  useEffect(() => {
    stateRef.current = { mood, tempo, isPlaying, progressMs, durationMs, showProgressRing };
  }, [mood, tempo, isPlaying, progressMs, durationMs, showProgressRing]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
      p5InstanceRef.current = null;
    }

    const sketch = (p: p5) => {
      // --- INTERNAL SIMULATION STATE (for interpolation) ---
      let curEnergy = 0.5;
      let curValence = 0.5;
      let curEuphoria = 0.5;
      let curCognition = 0.5;
      
      let beatImpulse = 0; // The "physics" value for the kick
      let lastBeatIndex = 0;
      let smoothProgress = 0;
      let lastTime = 0;
      
      // Particles
      let particles: { x: number, y: number, size: number, speed: number, offset: number }[] = [];
      
      p.setup = () => {
        if (!containerRef.current) return;
        p.createCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
        p.frameRate(60);
        
        // Init particles
        for(let i=0; i<60; i++) {
            particles.push({
                x: p.random(p.width),
                y: p.random(p.height),
                size: p.random(1, 4),
                speed: p.random(0.5, 2),
                offset: p.random(100)
            });
        }
      };

      p.windowResized = () => {
         if (containerRef.current) {
            p.resizeCanvas(containerRef.current.clientWidth, containerRef.current.clientHeight);
         }
      };

      // Helper to mix colors fluidly
      const getFluidColor = (energy: number, valence: number, beat: number) => {
         p.colorMode(p.HSB, 360, 100, 100);
         
         // Valence determines Hue Base (Mood Tone)
         // Map valence 0..1 to a hue range
         // 0.0 (Sad/Dark) -> 240 (Blue)
         // 0.5 (Neutral) -> 280 (Purple)
         // 1.0 (Happy/Bright) -> 340 (Pink) to 40 (Orange/Yellow)
         
         let targetHue;
         if (valence < 0.5) {
             targetHue = p.map(valence, 0, 0.5, 220, 270); 
         } else {
             targetHue = p.map(valence, 0.5, 1, 270, 380); 
         }
         if (targetHue > 360) targetHue -= 360;

         // Energy determines Saturation and Brightness
         const sat = p.map(energy, 0, 1, 50, 90);
         const bri = p.map(energy, 0, 1, 60, 100) + (beat * 15); 

         const c = p.color(targetHue, sat, Math.min(100, bri));
         p.colorMode(p.RGB);
         return c;
      };

      p.draw = () => {
         const now = p.millis();
         const dt = (now - lastTime) / 1000;
         lastTime = now;
         
         const state = stateRef.current;
         
         // 1. Interpolate Mood Values (Smooth Transitions)
         const lerpSpeed = 0.05; 
         
         // If paused, drop energy to "breathing" level (0.2)
         // This creates the smooth transition to idle
         const targetEnergy = state.isPlaying ? state.mood.energy : 0.2;
         const targetValence = state.mood.valence;
         const targetEuphoria = state.mood.euphoria;
         const targetCognition = state.mood.cognition;

         curEnergy = p.lerp(curEnergy, targetEnergy, lerpSpeed);
         curValence = p.lerp(curValence, targetValence, lerpSpeed);
         curEuphoria = p.lerp(curEuphoria, targetEuphoria, lerpSpeed);
         curCognition = p.lerp(curCognition, targetCognition, lerpSpeed);

         // 2. Progress & Rhythm Logic
         if (state.isPlaying) {
             const expectedProgress = state.progressMs;
             const diff = expectedProgress - smoothProgress;
             
             // Handle track seeks/changes (large jump) vs normal playback (small drift)
             if (Math.abs(diff) > 2000) {
                 smoothProgress = expectedProgress;
             } else {
                 smoothProgress += (dt * 1000); 
                 smoothProgress = p.lerp(smoothProgress, expectedProgress, 0.1);
             }
         } else {
             smoothProgress += dt * 1000 * 0.1; // Idle drift
         }

         // Beat Detection Logic
         const bpm = state.tempo || 120;
         const msPerBeat = 60000 / bpm;
         const beatIndex = Math.floor(smoothProgress / msPerBeat);
         
         // Trigger impulse on new beat
         if (beatIndex > lastBeatIndex && state.isPlaying) {
             beatImpulse = 1.0; 
             lastBeatIndex = beatIndex;
         }
         
         // Physics Decay: Reduces impulse by 8% every frame
         // This creates a natural "kick drum" envelope
         beatImpulse *= 0.92; 
         if (beatImpulse < 0.01) beatImpulse = 0;

         p.clear();

         // --- VISUALS START ---
         
         const themeColor = getFluidColor(curEnergy, curValence, beatImpulse);
         // accentColor was used for the inner ring, no longer needed
         // const accentColor = getFluidColor(curEuphoria, 1 - curValence, beatImpulse * 0.5);

         const cx = p.width / 2;
         const cy = p.height / 2;

         // 3. Particles
         particles.forEach(pt => {
             const moveSpeed = pt.speed * (0.2 + curEnergy * 3);
             pt.y -= moveSpeed;
             
             if (pt.y < 0) {
                 pt.y = p.height;
                 pt.x = p.random(p.width);
             }
             
             const alpha = p.map(pt.y, 0, p.height, 0, 150) * (0.5 + curEnergy);
             p.noStroke();
             p.fill(255, alpha);
             p.circle(pt.x, pt.y, pt.size * (1 + beatImpulse));
         });

         // 4. Main Visualizer Shape
         p.push();
         
         // Screen shake on heavy beats
         if (curEnergy > 0.7 && beatImpulse > 0.5) {
             const shake = beatImpulse * 5;
             p.translate(p.random(-shake, shake), p.random(-shake, shake));
         }

         const baseR = Math.min(p.width, p.height) * 0.25;
         // Breathing animation (always active, even when idle)
         const breathe = Math.sin(now / (msPerBeat / 2)) * 5 * curEnergy; 
         const kickR = beatImpulse * 40 * curEnergy;
         
         // Glow Effect
         // @ts-ignore
         const ctx = p.drawingContext as CanvasRenderingContext2D;
         ctx.shadowBlur = 20 + (beatImpulse * 40) + (curEuphoria * 20);
         ctx.shadowColor = themeColor.toString();

         p.stroke(themeColor);
         p.strokeWeight(3 + curEnergy * 3);
         p.noFill();

         // Shape parameters based on mood
         const noiseMax = 1.0 + (curEnergy * 3) + (curCognition * 2); 
         const timeScale = now * 0.0005 * (1 + curEnergy * 4); 
         const sharpSpikes = curCognition > 0.6; 

         p.beginShape();
         for (let a = 0; a < p.TWO_PI; a += 0.05) {
             const xoff = p.map(Math.cos(a), -1, 1, 0, noiseMax);
             const yoff = p.map(Math.sin(a), -1, 1, 0, noiseMax);
             
             let rOff = p.noise(xoff, yoff, timeScale);
             
             if (sharpSpikes) {
                 rOff = Math.pow(rOff, 3); // Sharpen the peaks
             }

             let r = baseR + (rOff * 50 * curEnergy) + kickR + breathe;
             
             const x = cx + r * Math.cos(a);
             const y = cy + r * Math.sin(a);
             p.vertex(x, y);
         }
         p.endShape(p.CLOSE);

         // 5. Secondary Ring (Echo) - REMOVED

         // 6. Progress Ring
         if (state.showProgressRing && state.durationMs > 0) {
             const progressRatio = smoothProgress / state.durationMs;
             const clampedRatio = Math.max(0, Math.min(1, progressRatio));
             
             if (clampedRatio > 0) {
                 const ringR = baseR + 60 + (curEnergy * 20);
                 
                 p.noFill();
                 p.stroke(255, 100);
                 p.strokeWeight(2);
                 // Background track
                 p.circle(cx, cy, ringR * 2);

                 // Active progress
                 p.stroke(themeColor);
                 p.strokeWeight(4);
                 ctx.shadowBlur = 15;
                 ctx.shadowColor = themeColor.toString();
                 
                 p.arc(cx, cy, ringR * 2, ringR * 2, -p.HALF_PI, -p.HALF_PI + (p.TWO_PI * clampedRatio));
                 
                 // Tip
                 const endAng = -p.HALF_PI + (p.TWO_PI * clampedRatio);
                 const tx = cx + ringR * Math.cos(endAng);
                 const ty = cy + ringR * Math.sin(endAng);
                 p.noStroke();
                 p.fill(255);
                 p.circle(tx, ty, 6 + beatImpulse * 4);
             }
         }
         
         p.pop();
         
         // Text HUD
         if (state.showProgressRing && state.isPlaying) {
             p.fill(255, 180);
             p.noStroke();
             p.textSize(10);
             p.textAlign(p.CENTER);
             p.textFont('monospace');
             p.text(`${Math.round(bpm)} BPM`, cx, cy + baseR + 90);
             p.text(`TONE: ${(curValence * 100).toFixed(0)}`, cx, cy + baseR + 105);
         }
      };
    };

    const P5 = (p5 as any).default || p5;
    // @ts-ignore
    p5InstanceRef.current = new P5(sketch, containerRef.current);

    return () => {
        if (p5InstanceRef.current) {
            p5InstanceRef.current.remove();
        }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Scene;