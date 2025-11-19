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
  // We use a ref to hold the latest props so the p5 closure can access them
  const stateRef = useRef({ mood, tempo, isPlaying, progressMs, durationMs, showProgressRing });

  useEffect(() => {
    stateRef.current = { mood, tempo, isPlaying, progressMs, durationMs, showProgressRing };
  }, [mood, tempo, isPlaying, progressMs, durationMs, showProgressRing]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous instance if it exists to prevent duplicates
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
      p5InstanceRef.current = null;
    }

    const sketch = (p: p5) => {
      let particles: { x: number, y: number, speed: number, size: number, alpha: number }[] = [];
      const numParticles = 50;
      
      // Smoothing variables
      let smoothProgressMs = 0;
      let lastPropProgressMs = 0;

      p.setup = () => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        p.createCanvas(clientWidth, clientHeight);
        p.frameRate(60);
        
        // Initialize particles
        for(let i=0; i<numParticles; i++) {
          particles.push({
            x: p.random(p.width),
            y: p.random(p.height),
            speed: p.random(0.5, 2),
            size: p.random(1, 3),
            alpha: p.random(50, 150)
          });
        }
      };

      p.windowResized = () => {
        if (containerRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            p.resizeCanvas(clientWidth, clientHeight);
        }
      };

      const getThemeColor = (energy: number, valence: number) => {
        p.colorMode(p.HSL);
        let c;
        if (energy > 0.8 && valence < 0.4) c = p.color(0, 100, 50); // Red (Metal)
        else if (valence > 0.7) c = p.color(300, 100, 60); // Pink/Magenta (Happy)
        else if (energy < 0.4) c = p.color(180, 80, 50); // Cyan (Chill)
        else if (energy > 0.8) c = p.color(45, 100, 50); // Gold (High Energy)
        else c = p.color(200, 60, 60); // Blueish default
        
        p.colorMode(p.RGB); // Reset to RGB for other drawings
        return c;
      };

      p.draw = () => {
        const { mood, tempo, isPlaying, progressMs, durationMs, showProgressRing } = stateRef.current;
        
        // --- SMOOTH PROGRESS LOGIC ---
        if (progressMs !== lastPropProgressMs) {
           smoothProgressMs = progressMs;
           lastPropProgressMs = progressMs;
        } else if (isPlaying) {
           smoothProgressMs += p.deltaTime;
        }
        if (smoothProgressMs > durationMs) smoothProgressMs = durationMs;

        p.clear(); 
        
        // --- BEAT LOGIC ---
        const secondsPerBeat = 60 / (tempo || 120);
        const time = p.millis() / 1000;
        
        let kick = 0;
        if (isPlaying) {
            const totalBeats = (smoothProgressMs / 1000) / secondsPerBeat;
            const currentBeatPhase = totalBeats % 1;
            kick = Math.pow(Math.max(0, 1 - currentBeatPhase), 4); 
        } else {
            kick = Math.sin(time) * 0.2; 
        }

        const centerX = p.width / 2;
        const centerY = p.height / 2;

        // --- SCREEN SHAKE ---
        p.push(); 
        if (isPlaying && mood.energy > 0.8) {
            const shakeAmt = kick * 5 * mood.energy;
            p.translate(p.random(-shakeAmt, shakeAmt), p.random(-shakeAmt, shakeAmt));
        }

        // --- PARTICLES ---
        p.noStroke();
        particles.forEach(pt => {
            const speedMult = isPlaying ? 1 + (mood.energy * 2) + kick : 0.2;
            pt.y -= pt.speed * speedMult;
            if (pt.y < 0) {
                pt.y = p.height;
                pt.x = p.random(p.width);
            }
            p.fill(255, pt.alpha);
            p.circle(pt.x, pt.y, pt.size);
        });

        // --- VISUALIZER GEOMETRY CONFIG ---
        const baseColor = getThemeColor(mood.energy, mood.valence);
        
        // @ts-ignore
        const ctx = p.drawingContext;
        ctx.shadowBlur = 20 + (kick * 30);
        ctx.shadowColor = baseColor.toString();

        const baseRadius = Math.min(p.width, p.height) * 0.25;
        const expansion = kick * (50 * mood.energy);
        
        const isSpiky = mood.energy > 0.6 && mood.valence < 0.5;
        const noiseMax = isSpiky ? 3.0 + (mood.energy * 2) : 1.0;
        const noiseSpeed = time * (isPlaying ? (0.5 + mood.energy) : 0.2);

        // Shared function to calculate radius at any angle
        // This ensures the progress ring follows the EXACT same shape as the inner visualizer
        const getRadius = (angle: number) => {
            const xoff = p.map(Math.cos(angle), -1, 1, 0, noiseMax);
            const yoff = p.map(Math.sin(angle), -1, 1, 0, noiseMax);
            let n = p.noise(xoff, yoff, noiseSpeed);
            
            let r = baseRadius + expansion;
            if (isSpiky) {
                 r += p.map(n, 0, 1, -20, 80 * mood.energy);
            } else {
                 r += p.map(n, 0, 1, -30, 30);
            }

            if (mood.cognition > 0.7) {
                // Use deterministic noise instead of random so outer ring matches inner ring
                const jitter = p.map(p.noise(angle * 10, time * 15), 0, 1, -3, 3);
                r += jitter;
            }
            return r;
        };

        // --- DRAW INNER SHAPE ---
        p.noFill();
        p.stroke(baseColor);
        p.strokeWeight(3 + (kick * 2));

        p.beginShape();
        for (let a = 0; a <= p.TWO_PI; a += 0.05) {
            const r = getRadius(a);
            const x = centerX + r * Math.cos(a);
            const y = centerY + r * Math.sin(a);
            p.vertex(x, y);
        }
        p.endShape(p.CLOSE);

        // --- DRAW PROGRESS RING ---
        if (isPlaying && durationMs > 0 && showProgressRing) {
            const progress = Math.min(1, smoothProgressMs / durationMs);
            
            if (progress > 0) {
                ctx.shadowBlur = 10 + (kick * 10);
                ctx.shadowColor = baseColor.toString();
                
                p.stroke(baseColor);
                p.strokeWeight(4);
                p.strokeCap(p.ROUND);
                p.noFill();

                const outerGap = 20 + (kick * 10); // Gap between visualizer and progress ring

                p.beginShape();
                const startAngle = -p.HALF_PI; // Start at top
                const totalRotation = p.TWO_PI * progress;
                const endAngle = startAngle + totalRotation;

                // Draw segment matching noise shape
                for (let a = startAngle; a <= endAngle; a += 0.05) {
                    const r = getRadius(a) + outerGap;
                    const x = centerX + r * Math.cos(a);
                    const y = centerY + r * Math.sin(a);
                    p.vertex(x, y);
                }

                // Ensure line ends exactly at progress point
                const finalR = getRadius(endAngle) + outerGap;
                const finalX = centerX + finalR * Math.cos(endAngle);
                const finalY = centerY + finalR * Math.sin(endAngle);
                p.vertex(finalX, finalY);
                
                p.endShape();

                // Draw Head (Circle at tip)
                p.noStroke();
                p.fill(255);
                p.circle(finalX, finalY, 6 + (kick * 2));
            }
        }

        // --- HUD ELEMENTS (Only visible when ring is showing) ---
        if (showProgressRing) {
            p.fill(255);
            p.noStroke();
            p.textAlign(p.LEFT, p.TOP);
            p.textSize(12);
            p.textFont('monospace');
            
            const leftX = 40;
            const topY = p.height - 150;
            
            if (isPlaying) {
                p.text(`BPM: ${Math.round(tempo)}`, leftX, topY);
                p.text(`NRG: ${(mood.energy * 100).toFixed(0)}%`, leftX, topY + 20);
                p.text(`TONE: ${(mood.valence * 100).toFixed(0)}%`, leftX, topY + 40);
                
                const barW = 100;
                p.noFill();
                p.stroke(255, 50);
                p.rect(leftX, topY + 60, barW, 5);
                p.noStroke();
                p.fill(baseColor);
                p.rect(leftX, topY + 60, barW * kick, 5);
            }
        }
        
        p.pop(); 
      };
    };

    try {
        // @ts-ignore
        const P5Constructor = p5.default || p5;
        p5InstanceRef.current = new P5Constructor(sketch, containerRef.current);
    } catch (e) {
        console.error("Failed to initialize p5:", e);
    }

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
    };
  }, []); 

  return <div ref={containerRef} className="w-full h-full overflow-hidden" />;
};

export default Scene;