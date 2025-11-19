import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { MoodState, VisualizerMaterial } from '../types';
import { createNoise3D } from 'simplex-noise';

// --- Helper: Particle Texture Generation ---
const getParticleTexture = () => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};

// --- Types & Interfaces ---
interface SceneProps {
  mood: MoodState;
  tempo: number;
  isPlaying: boolean;
}

// --- Shared State Hook for Interpolation ---
// This helps transition values smoothly between frames instead of snapping
const useSmoothedState = (
  targetMood: MoodState, 
  targetIsPlaying: boolean, 
  targetTempo: number
) => {
  const current = useRef({
    energy: 0,
    valence: 0,
    euphoria: 0,
    cognition: 0,
    intensity: 0, // 0 = paused/static, 1 = full playing
    beatAccumulator: 0, // To track beat position
    tempo: 0
  });

  useFrame((state, delta) => {
    const dampSpeed = 2.0; // Speed of mood transition
    const playSpeed = 3.0; // Speed of play/pause transition

    // Interpolate Mood
    current.current.energy = THREE.MathUtils.damp(current.current.energy, targetMood.energy, dampSpeed, delta);
    current.current.valence = THREE.MathUtils.damp(current.current.valence, targetMood.valence, dampSpeed, delta);
    current.current.euphoria = THREE.MathUtils.damp(current.current.euphoria, targetMood.euphoria, dampSpeed, delta);
    current.current.cognition = THREE.MathUtils.damp(current.current.cognition, targetMood.cognition, dampSpeed, delta);
    
    // Interpolate Tempo
    current.current.tempo = THREE.MathUtils.damp(current.current.tempo, targetTempo, dampSpeed, delta);

    // Interpolate Intensity (Play/Pause state)
    const targetIntensity = targetIsPlaying ? 1.0 : 0.0;
    current.current.intensity = THREE.MathUtils.damp(current.current.intensity, targetIntensity, playSpeed, delta);

    // Calculate Beat Pulse
    // We accumulate time scaled by BPM to keep rhythm steady
    if (current.current.tempo > 0) {
       // BPM / 60 = Beats per second
       const beatsPerSecond = current.current.tempo / 60;
       current.current.beatAccumulator += delta * beatsPerSecond;
    }
  });

  return current;
};

// --- Particle System Component ---

const ParticleSystem = ({ smoothedValues }: { smoothedValues: React.MutableRefObject<any> }) => {
  const maxCount = 1000; 
  const meshRef = useRef<THREE.Points>(null);
  const particleTexture = useMemo(() => getParticleTexture(), []);

  const initialData = useMemo(() => {
    const positions = new Float32Array(maxCount * 3);
    const randoms = new Float32Array(maxCount * 3);
    
    for (let i = 0; i < maxCount; i++) {
      const r = 4 + Math.random() * 5; // Initial radius distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      randoms[i * 3] = Math.random();
      randoms[i * 3 + 1] = Math.random();
      randoms[i * 3 + 2] = Math.random();
    }
    return { positions, randoms };
  }, []);

  // Reusable colors
  const cEnergy = useMemo(() => new THREE.Color("#ffaa00"), []);
  const cValence = useMemo(() => new THREE.Color("#00d2ff"), []);
  const cEuphoria = useMemo(() => new THREE.Color("#ff4081"), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const { energy, valence, euphoria, intensity, beatAccumulator } = smoothedValues.current;
    const time = state.clock.getElapsedTime();

    // If intensity is very low (paused), hide particles
    if (intensity < 0.01) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;

    const geom = meshRef.current.geometry;
    const positions = geom.attributes.position.array as Float32Array;
    const colors = geom.attributes.color.array as Float32Array;

    // Calculate Color based on smoothed mood
    targetColor.setRGB(0, 0, 0);
    targetColor.r += cValence.r * valence + cEnergy.r * energy + cEuphoria.r * euphoria;
    targetColor.g += cValence.g * valence + cEnergy.g * energy + cEuphoria.g * euphoria;
    targetColor.b += cValence.b * valence + cEnergy.b * energy + cEuphoria.b * euphoria;
    // Normalize
    const maxC = Math.max(targetColor.r, targetColor.g, targetColor.b, 1);
    targetColor.multiplyScalar(1/maxC);

    // Beat Pulse Logic (Kick Drum simulation)
    // beatAccumulator goes 0 -> 1 -> 2 etc.
    // Math.PI * 2 * beatAccumulator gives a sine wave that matches BPM
    // Pow(sin, 10) makes it a sharp pulse
    const beatPhase = beatAccumulator % 1;
    const rawPulse = Math.sin(beatAccumulator * Math.PI * 2);
    // Sharp kick on the beat
    const kick = Math.pow(Math.max(0, rawPulse), 10); 
    
    // Expansion factor based on beat
    const expansion = 1 + (kick * 0.3 * energy);

    for (let i = 0; i < maxCount; i++) {
      const ix = i * 3;
      const rx = initialData.randoms[ix];
      const ry = initialData.randoms[ix + 1];
      const rz = initialData.randoms[ix + 2];

      const bx = initialData.positions[ix];
      const by = initialData.positions[ix + 1];
      const bz = initialData.positions[ix + 2];

      // Orbiting movement
      const speed = 0.2 + (energy * 0.5);
      const t = time * speed + rx * 10;

      // Base Position + Drift
      let px = bx + Math.sin(t) * 0.5;
      let py = by + Math.cos(t * 0.8) * 0.5;
      let pz = bz + Math.sin(t * 1.2) * 0.5;

      // Apply Rhythm Expansion
      px *= expansion;
      py *= expansion;
      pz *= expansion;

      // Apply Intensity (shrink to center when paused)
      px *= intensity;
      py *= intensity;
      pz *= intensity;

      positions[ix] = px;
      positions[ix + 1] = py;
      positions[ix + 2] = pz;

      // Alpha / Brightness
      // Particles fade out when intensity drops
      const baseAlpha = 0.3 + (euphoria * 0.5);
      // Flash on kick
      const beatFlash = kick * energy; 
      
      const alpha = (baseAlpha + beatFlash) * intensity;

      colors[ix] = targetColor.r * alpha;
      colors[ix + 1] = targetColor.g * alpha;
      colors[ix + 2] = targetColor.b * alpha;
    }

    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
    
    // Rotate entire cloud slowly
    meshRef.current.rotation.y = time * 0.05 * intensity;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute 
          attach="attributes-position" 
          count={maxCount} 
          array={new Float32Array(maxCount * 3)} 
          itemSize={3} 
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute 
          attach="attributes-color" 
          count={maxCount} 
          array={new Float32Array(maxCount * 3)} 
          itemSize={3} 
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.2}
        vertexColors 
        transparent 
        opacity={1} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false}
        map={particleTexture || undefined}
      />
    </points>
  );
};

// --- Main Visualizer Blob ---

const AudioReactiveBlob = ({ smoothedValues }: { smoothedValues: React.MutableRefObject<any> }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const noise3D = useMemo(() => createNoise3D(), []);
  
  // Determine material type based on dominant mood (calculated from props in parent, but simplified here)
  // We'll just swap materials based on the smoothed values in the ref during render if needed, 
  // but swapping materials in useFrame is expensive. 
  // Better to stick to one versatile material or update properties.
  // For this implementation, let's use a high-quality dynamic material that adapts.

  const materialRef = useRef<any>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const { energy, valence, euphoria, cognition, intensity, beatAccumulator } = smoothedValues.current;
    const time = state.clock.getElapsedTime();

    // --- BEAT SYNTHESIS ---
    // Create a sharp impulse for the beat
    const rawSine = Math.sin(beatAccumulator * Math.PI * 2);
    // 'Kick' is positive only, sharp peak
    const kick = Math.pow(Math.max(0, rawSine), 8); 
    // 'Snare' or offbeat noise
    const fastNoise = noise3D(time * 2, 0, 0);

    // --- DISTORTION LOGIC ---
    // If intensity is 0 (paused), distortion is 0 -> Perfect Sphere
    const baseDistortion = intensity * (0.2 + (energy * 0.6)); 
    const beatDistortion = intensity * (kick * 0.4 * energy); // Extra pop on beat

    const geometry = meshRef.current.geometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    const originalPositions = (geometry.attributes.originalPosition as THREE.BufferAttribute)?.array || geometry.attributes.position.array;
    
    // Store original positions once to prevent sphere from degrading
    if (!geometry.attributes.originalPosition) {
      geometry.setAttribute('originalPosition', positionAttribute.clone());
    }

    // Noise parameters
    // Higher cognition = more complex, high frequency noise (spiky)
    // Higher valence = smoother, flowing noise
    const noiseFreq = 1.0 + (cognition * 2.0);
    const speed = time * (0.5 + (energy * 0.5));

    for (let i = 0; i < positionAttribute.count; i++) {
      // Read from ORIGINAL perfect sphere position
      vertex.fromBufferAttribute(geometry.attributes.originalPosition as THREE.BufferAttribute, i);
      
      // Calculate Noise
      const n = noise3D(
        vertex.x * noiseFreq + speed,
        vertex.y * noiseFreq + speed,
        vertex.z * noiseFreq
      );

      // Apply Distortion
      // Combine smooth flow + beat kick
      const scalar = 1 + (n * baseDistortion) + (kick * n * 0.2);
      
      vertex.multiplyScalar(scalar);
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();

    // --- COLOR & MATERIAL UPDATE ---
    if (materialRef.current) {
        const c1 = new THREE.Color("#2b2b2b"); // Dark base
        const c2 = new THREE.Color("#ffb347"); // Energy
        const c3 = new THREE.Color("#32c9ff"); // Valence
        const c4 = new THREE.Color("#ff4081"); // Euphoria

        const finalColor = c1.clone();
        finalColor.lerp(c2, energy * intensity);
        finalColor.lerp(c3, valence * intensity);
        finalColor.lerp(c4, euphoria * intensity * kick); // Flash on beat

        materialRef.current.color = finalColor;
        materialRef.current.emissive = finalColor;
        // Pulse emissive intensity with beat
        materialRef.current.emissiveIntensity = (0.2 + (euphoria * 0.8) + (kick * 0.5)) * intensity;
        
        // Modify roughness/metalness based on mood
        materialRef.current.roughness = 0.5 - (cognition * 0.4); // Focus makes it sharper/shiny
        materialRef.current.metalness = 0.3 + (energy * 0.5);
    }
    
    // Rotation
    meshRef.current.rotation.y += 0.002 + (energy * 0.01 * intensity);
    meshRef.current.rotation.z = Math.sin(time * 0.2) * 0.1 * intensity;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.2, 128, 128]} />
      <meshStandardMaterial 
        ref={materialRef}
        color="#ffffff"
        roughness={0.4}
        metalness={0.5}
      />
    </mesh>
  );
};

// --- Scene Content Wrapper ---
const SceneContent: React.FC<SceneProps> = ({ mood, tempo, isPlaying }) => {
  const { width } = useThree((state) => state.viewport);
  const isMobile = width < 7; 
  
  // Use the smoothing hook
  const smoothedValues = useSmoothedState(mood, isPlaying, tempo);

  // Responsive positioning
  let groupScale = 1.0;
  let groupPos: [number, number, number] = [0, 0, 0];

  if (isMobile) {
    groupScale = 0.6; 
    groupPos = [0, 0.5, 0]; 
  } else {
    groupPos = [0, 0, 0];
    groupScale = 0.9;
  }

  return (
    <group scale={groupScale} position={groupPos}>
        <AudioReactiveBlob smoothedValues={smoothedValues} />
        <ParticleSystem smoothedValues={smoothedValues} />
    </group>
  );
};

const Scene: React.FC<SceneProps> = ({ mood, tempo, isPlaying }) => {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 35 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.2} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#32c9ff" />
      <pointLight position={[0, 5, 5]} intensity={0.8} />
      
      <Environment preset="night" />
      
      <SceneContent mood={mood} tempo={tempo} isPlaying={isPlaying} />
      
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
};

export default Scene;
