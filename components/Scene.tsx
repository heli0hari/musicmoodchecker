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

// --- Particle System Component ---

const ParticleSystem = ({ mood, isPlaying }: { mood: MoodState, isPlaying: boolean }) => {
  const maxCount = 800; // Increased count for better visibility
  const meshRef = useRef<THREE.Points>(null);
  
  // Use a ref to access current mood inside useFrame without dependency issues
  const moodRef = useRef(mood);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  // Memoize texture
  const particleTexture = useMemo(() => getParticleTexture(), []);

  // Store initial random values
  const initialData = useMemo(() => {
    const positions = new Float32Array(maxCount * 3);
    const randoms = new Float32Array(maxCount * 3);
    const sizes = new Float32Array(maxCount);
    
    for (let i = 0; i < maxCount; i++) {
      const r = 3.5 + Math.random() * 4.5; 
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      randoms[i * 3] = Math.random();
      randoms[i * 3 + 1] = Math.random();
      randoms[i * 3 + 2] = Math.random();

      sizes[i] = Math.random();
    }
    return { positions, randoms, sizes };
  }, []);

  // Reusable color objects to avoid GC
  const cEnergy = useMemo(() => new THREE.Color("#ffaa00"), []);
  const cValence = useMemo(() => new THREE.Color("#00d2ff"), []);
  const cEuphoria = useMemo(() => new THREE.Color("#ff4081"), []);
  const cPeace = useMemo(() => new THREE.Color("#aaddff"), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    // Access latest mood from ref
    const currentMood = moodRef.current;
    
    const time = state.clock.getElapsedTime();
    const geom = meshRef.current.geometry;
    const positions = geom.attributes.position.array as Float32Array;
    const colors = geom.attributes.color.array as Float32Array;
    
    const isRelaxed = currentMood.energy < 0.4 && currentMood.valence > 0.3;
    const isHighEnergy = currentMood.energy > 0.7;

    // --- Active Count Logic (Reactivity) ---
    // Directly link active particles to energy for obvious feedback
    let activeRatio = 0.3 + (currentMood.energy * 0.7);
    if (isRelaxed) activeRatio = 0.6; 
    
    const activeCount = Math.floor(maxCount * Math.min(1, activeRatio));

    // --- Color Logic (Reactivity) ---
    if (isRelaxed) {
        targetColor.copy(cPeace).lerp(cValence, 0.3);
    } else {
        // Reset
        targetColor.setRGB(0,0,0);
        // Additive mixing based on weights
        targetColor.r += cValence.r * currentMood.valence;
        targetColor.g += cValence.g * currentMood.valence;
        targetColor.b += cValence.b * currentMood.valence;

        targetColor.r += cEnergy.r * currentMood.energy;
        targetColor.g += cEnergy.g * currentMood.energy;
        targetColor.b += cEnergy.b * currentMood.energy;

        targetColor.r += cEuphoria.r * currentMood.euphoria;
        targetColor.g += cEuphoria.g * currentMood.euphoria;
        targetColor.b += cEuphoria.b * currentMood.euphoria;
        
        // Normalize if too bright
        if (targetColor.r > 1 || targetColor.g > 1 || targetColor.b > 1) {
             targetColor.multiplyScalar(1/Math.max(targetColor.r, targetColor.g, targetColor.b));
        }
    }

    let timeScale = 0.01; 
    let driftAmp = 0.5;

    if (isRelaxed) {
      timeScale = 0.002;
      driftAmp = 1.2;
    } else if (isHighEnergy) {
      timeScale = 0.02 + (currentMood.energy * 0.02);
      driftAmp = 0.4;          
    } else {
      timeScale = 0.01; 
      driftAmp = 0.6;
    }

    const beatSpeed = isPlaying ? (isHighEnergy ? 4 : 2) : 1;

    for (let i = 0; i < maxCount; i++) {
      const isActive = i < activeCount;
      const ix = i * 3;
      
      if (isActive) {
        const rx = initialData.randoms[ix];
        const ry = initialData.randoms[ix + 1];
        const rz = initialData.randoms[ix + 2];

        const bx = initialData.positions[ix];
        const by = initialData.positions[ix + 1];
        const bz = initialData.positions[ix + 2];

        // Movement
        const dx = Math.sin(time * timeScale * 0.5 + rx * 10) * driftAmp;
        const dy = Math.cos(time * timeScale * 0.3 + ry * 10) * driftAmp;
        const dz = Math.sin(time * timeScale * 0.4 + rz * 10) * driftAmp;

        positions[ix] = bx + dx;
        positions[ix + 1] = by + dy;
        positions[ix + 2] = bz + dz;

        // Beat Pulse
        const pulse = Math.sin(time * beatSpeed + (rx * 10)); 
        
        // Alpha/Brightness
        let alpha = 0.6;
        
        if (isRelaxed) {
            alpha = 0.3 + (Math.sin(time * 0.5 + rx * 5) * 0.2); 
        } else {
            const minAlpha = 0.4 + (currentMood.energy * 0.3);
            const sparkle = (currentMood.euphoria > 0.6 && pulse > 0.9) ? 0.8 : 0;
            alpha = minAlpha + (pulse * 0.2 * currentMood.euphoria) + sparkle;
        }

        alpha = Math.max(0, Math.min(1, alpha));

        // Color Jitter
        const rVar = (rx - 0.5) * 0.1;
        const gVar = (ry - 0.5) * 0.1;
        const bVar = (rz - 0.5) * 0.1;

        colors[ix] = Math.max(0, (targetColor.r + rVar) * alpha);
        colors[ix + 1] = Math.max(0, (targetColor.g + gVar) * alpha);
        colors[ix + 2] = Math.max(0, (targetColor.b + bVar) * alpha);

      } else {
        // Collapse inactive particles to center or hide them
        positions[ix] = 0; positions[ix+1] = 0; positions[ix+2] = 0;
        colors[ix] = 0; colors[ix+1] = 0; colors[ix+2] = 0;
      }
    }

    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
    
    const rotSpeedY = isRelaxed ? 0.0005 : 0.0005 + (currentMood.energy * 0.002);
    meshRef.current.rotation.y += rotSpeedY; 
  });

  const particleSize = 0.15 + (mood.euphoria * 0.1);

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
        size={particleSize}
        vertexColors 
        transparent 
        opacity={1} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false}
        map={particleTexture || undefined}
        sizeAttenuation={true}
      />
    </points>
  );
};

// --- Main Visualizer Blob ---

const AudioReactiveBlob = ({ mood, tempo, isPlaying }: { mood: MoodState, tempo: number, isPlaying: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const noise3D = useMemo(() => createNoise3D(), []);
  
  const materialType = useMemo(() => {
    if (mood.cognition > 0.8) return VisualizerMaterial.Glass;
    if (mood.energy > 0.75 && mood.valence < 0.4) return VisualizerMaterial.Metal;
    if (mood.energy > 0.5 && mood.valence < 0.5) return VisualizerMaterial.Rock;
    if (mood.valence > 0.6 && mood.euphoria > 0.5) return VisualizerMaterial.Romance;
    return VisualizerMaterial.Liquid;
  }, [mood.cognition, mood.valence, mood.energy, mood.euphoria]);

  const baseColor = useMemo(() => {
    const c1 = new THREE.Color("#2b2b2b");
    const c2 = new THREE.Color("#ffb347");
    const c3 = new THREE.Color("#32c9ff");
    return c1.clone().lerp(c3, mood.valence).lerp(c2, mood.energy * 0.5);
  }, [mood.energy, mood.valence]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();
    
    // --- Simulated Beat Logic ---
    let beatPulse = 0;
    if (isPlaying && tempo > 0) {
      const beatDuration = 60 / tempo;
      const beatProgress = (time % beatDuration) / beatDuration;
      if (materialType === VisualizerMaterial.Romance) {
        beatPulse = (Math.sin(beatProgress * Math.PI * 2) > 0.9 ? 0.2 : 0);
      } else {
        beatPulse = Math.pow(Math.sin(beatProgress * Math.PI), 5); 
      }
    } else {
      beatPulse = (Math.sin(time) * 0.5 + 0.5) * 0.2; 
    }

    // Vertex Displacement
    const geometry = meshRef.current.geometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    
    let noiseFreq = 1.2;
    let noiseAmp = 0.3;
    
    if (materialType === VisualizerMaterial.Metal) {
        noiseFreq = 3.0; noiseAmp = 0.5; 
    }

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      vertex.normalize();
      
      const movement = time * (0.2 + mood.energy * 0.6);
      
      const noiseVal = noise3D(
        vertex.x * noiseFreq + movement,
        vertex.y * noiseFreq + movement,
        vertex.z * noiseFreq
      );

      const distortion = 0.8 + (noiseVal * noiseAmp) + (beatPulse * 0.15);
      vertex.multiplyScalar(distortion);
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();

    meshRef.current.rotation.y += 0.002 + (mood.energy * 0.01);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      
      {materialType === VisualizerMaterial.Liquid && (
        <meshStandardMaterial 
          color={baseColor}
          roughness={0.2}
          metalness={0.8}
          emissive={baseColor}
          emissiveIntensity={mood.euphoria * 0.5}
        />
      )}

      {materialType === VisualizerMaterial.Rock && (
        <meshStandardMaterial 
          color={'#2a2a2a'}
          roughness={0.9}
          metalness={0.2}
          flatShading={true}
        />
      )}

      {materialType === VisualizerMaterial.Metal && (
         <meshStandardMaterial 
           color={'#ffffff'}
           roughness={0.15}
           metalness={1.0}
           envMapIntensity={2.0}
         />
      )}

      {materialType === VisualizerMaterial.Romance && (
         <meshPhysicalMaterial 
            color={'#ff4d6d'} 
            emissive={'#590d22'} 
            emissiveIntensity={0.5}
            roughness={0.2}
            metalness={0.1}
            clearcoat={1.0} 
            transmission={0.2} 
         />
      )}

      {materialType === VisualizerMaterial.Glass && (
        <MeshTransmissionMaterial 
          backside samples={4} thickness={1.5} roughness={0.1}
          chromaticAberration={0.1} anisotropy={0.3} color={baseColor}
        />
      )}
    </mesh>
  );
};

interface SceneProps {
  mood: MoodState;
  tempo: number;
  isPlaying: boolean;
}

const SceneContent: React.FC<SceneProps> = ({ mood, tempo, isPlaying }) => {
  const { width } = useThree((state) => state.viewport);
  
  // Robust Mobile Check based on viewport width relative to typical mobile sizes
  const isMobile = width < 7; 

  // Responsive Logic
  let groupScale = 1.0;
  let groupPos: [number, number, number] = [0, 0, 0];

  if (isMobile) {
    // Mobile: Sidebar is at bottom. 
    // Move Visual UP (positive Y) to be visible in the top half.
    // Lowered from 1.0 to 0.2 to be centered in the viewable area above the panel
    groupScale = 0.6; 
    groupPos = [0, 0.2, 0]; 
  } else {
    // Desktop: Sidebar right. Center.
    groupPos = [0, 0, 0];
    groupScale = 0.9;
  }

  return (
    <group scale={groupScale} position={groupPos}>
        <AudioReactiveBlob mood={mood} tempo={tempo} isPlaying={isPlaying} />
        <ParticleSystem mood={mood} isPlaying={isPlaying} />
    </group>
  );
};

const Scene: React.FC<SceneProps> = ({ mood, tempo, isPlaying }) => {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 35 }} gl={{ alpha: true }}>
      <ambientLight intensity={0.4} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#32c9ff" />
      <pointLight position={[0, 5, -5]} intensity={2} color="#ffffff" />
      <Environment preset="city" />
      <SceneContent mood={mood} tempo={tempo} isPlaying={isPlaying} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
};

export default Scene;