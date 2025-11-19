import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { MoodState, VisualizerMaterial } from '../types';
import { createNoise3D } from 'simplex-noise';

// --- Helper: Particle Texture Generation ---
// Creates a soft glow texture programmatically to avoid external asset dependencies
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
  const maxCount = 600; 
  const meshRef = useRef<THREE.Points>(null);
  
  // Define mood derived states at component level
  const isHighEnergy = mood.energy > 0.7;
  const isRelaxed = mood.energy < 0.4 && mood.valence > 0.3;

  // Memoize texture
  const particleTexture = useMemo(() => getParticleTexture(), []);

  // Store initial random values to anchor the movement
  const initialData = useMemo(() => {
    const positions = new Float32Array(maxCount * 3);
    const randoms = new Float32Array(maxCount * 3); // For phase offsets
    const sizes = new Float32Array(maxCount); // Base sizes
    
    for (let i = 0; i < maxCount; i++) {
      // Distribute particles in a spherical shell around the center blob
      const r = 3.0 + Math.random() * 4.0; 
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

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();
    const geom = meshRef.current.geometry;
    const positions = geom.attributes.position.array as Float32Array;
    const colors = geom.attributes.color.array as Float32Array;
    
    // Active Count Logic
    let activeRatio = 0.4 + (mood.energy * 0.4); 
    if (isRelaxed) activeRatio = 0.7; 
    
    const activeCount = Math.floor(maxCount * Math.min(1, activeRatio));

    // Determine color mix
    const cEnergy = new THREE.Color("#ffaa00");   // Gold/Orange
    const cValence = new THREE.Color("#00d2ff");  // Cyan
    const cEuphoria = new THREE.Color("#ff4081"); // Pink
    const cPeace = new THREE.Color("#aaddff");    // Soft White/Blue for relaxed
    
    let targetColor = new THREE.Color("#000000");

    if (isRelaxed) {
        targetColor = cPeace.clone().lerp(cValence, 0.3);
    } else {
        targetColor.lerp(cValence, mood.valence);
        targetColor.lerp(cEnergy, mood.energy * 0.7);
        targetColor.lerp(cEuphoria, mood.euphoria * 0.6);
    }

    // --- Movement Parameters (SLOWED DOWN) ---

    let timeScale = 0.015; // Much slower default
    let driftAmp = 0.5;

    if (isRelaxed) {
      // SLOW, FREE, FLOATING
      timeScale = 0.005;       // Extremely slow
      driftAmp = 1.5;         // Wide float
    } else if (isHighEnergy) {
      // ORBITAL but not too fast
      timeScale = 0.03 + (mood.energy * 0.08); // Reduced from 0.1+
      driftAmp = 0.3;          
    } else {
      // NOMINAL
      timeScale = 0.015; 
      driftAmp = 0.6;
    }

    // Reduce chaos: Minimal jitter unless extreme energy
    const jitterAmount = isHighEnergy && mood.energy > 0.95 ? 0.01 : 0.001;

    // --- Animation Loop ---

    for (let i = 0; i < maxCount; i++) {
      const isActive = i < activeCount;
      const ix = i * 3;
      
      const rx = initialData.randoms[ix];
      const ry = initialData.randoms[ix + 1];
      const rz = initialData.randoms[ix + 2];

      if (isActive) {
        const bx = initialData.positions[ix];
        const by = initialData.positions[ix + 1];
        const bz = initialData.positions[ix + 2];

        // Organic movement
        const dx = Math.sin(time * timeScale * 0.5 + rx * 10) * driftAmp;
        const dy = Math.cos(time * timeScale * 0.3 + ry * 10) * driftAmp;
        const dz = Math.sin(time * timeScale * 0.4 + rz * 10) * driftAmp;

        // Jitter
        const jx = (Math.random() - 0.5) * jitterAmount;
        const jy = (Math.random() - 0.5) * jitterAmount;
        const jz = (Math.random() - 0.5) * jitterAmount;

        positions[ix] = bx + dx + jx;
        positions[ix + 1] = by + dy + jy;
        positions[ix + 2] = bz + dz + jz;

        // --- Color & Glow Logic ---
        
        // Beat Pulse
        const beatSpeed = isPlaying ? (isHighEnergy ? 4 : 2) : 1;
        // Add a phase offset so they don't blink in unison
        const pulse = Math.sin(time * beatSpeed + (rx * 10)); 
        
        // Base Alpha
        let alpha = 0.5;
        
        if (isRelaxed) {
            // Soft, slow breathing glow
            alpha = 0.2 + (Math.sin(time * 0.5 + rx * 5) * 0.15); 
        } else {
            // Energetic pulse
            const minAlpha = 0.3 + (mood.energy * 0.2);
            // If euphoric, allow occasional bright flashes (sparkles)
            const sparkle = (mood.euphoria > 0.6 && pulse > 0.9) ? 0.5 : 0;
            alpha = minAlpha + (pulse * 0.2 * mood.euphoria) + sparkle;
        }

        // Clamp alpha
        alpha = Math.max(0, Math.min(1, alpha));

        // Apply slight color variation
        const rVar = (rx - 0.5) * 0.1;
        const gVar = (ry - 0.5) * 0.1;
        const bVar = (rz - 0.5) * 0.1;

        // Final Color with Alpha premultiplication for Additive Blending
        colors[ix] = Math.max(0, (targetColor.r + rVar) * alpha);
        colors[ix + 1] = Math.max(0, (targetColor.g + gVar) * alpha);
        colors[ix + 2] = Math.max(0, (targetColor.b + bVar) * alpha);

      } else {
        positions[ix] = 0;
        positions[ix + 1] = 0;
        positions[ix + 2] = 0;
        // Hide inactive particles completely
        colors[ix] = 0;
        colors[ix + 1] = 0;
        colors[ix + 2] = 0;
      }
    }

    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
    
    // Global System Rotation (Slowed down)
    const rotSpeedY = isRelaxed ? 0.001 : 0.003 + (mood.energy * 0.01);
    const rotSpeedZ = isRelaxed ? 0.0005 : (mood.energy * 0.002);

    if (meshRef.current) {
        meshRef.current.rotation.y += rotSpeedY * 0.05; 
        meshRef.current.rotation.z = Math.sin(time * 0.2) * rotSpeedZ;
    }
  });

  // Base particle size
  const particleSize = isRelaxed ? 0.2 : 0.12 + (mood.euphoria * 0.08);

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
        opacity={1} // Controlled via vertex colors
        blending={THREE.AdditiveBlending} 
        depthWrite={false}
        map={particleTexture || undefined}
        alphaMap={particleTexture || undefined}
        sizeAttenuation={true}
      />
    </points>
  );
};

// --- Main Visualizer Blob ---

const AudioReactiveBlob = ({ mood, tempo, isPlaying }: { mood: MoodState, tempo: number, isPlaying: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const noise3D = useMemo(() => createNoise3D(), []);
  
  const isRelaxed = mood.energy < 0.4 && mood.valence > 0.3;

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
        beatPulse = (Math.sin(beatProgress * Math.PI * 2) > 0.9 ? 0.2 : 0) + (Math.sin((beatProgress - 0.15) * Math.PI * 2) > 0.9 ? 0.1 : 0);
      } else {
        beatPulse = Math.pow(Math.sin(beatProgress * Math.PI), 10); 
      }
    } else {
      beatPulse = (Math.sin(time) * 0.5 + 0.5) * 0.2; 
    }

    // Vertex Displacement
    const geometry = meshRef.current.geometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    
    let noiseFreq = 1.0;
    let noiseAmp = 1.0;
    let movementSpeed = 1.0;

    switch (materialType) {
      case VisualizerMaterial.Metal:
        noiseFreq = 3.5; 
        noiseAmp = 0.5; 
        movementSpeed = 1.5; // Slowed
        break;
      case VisualizerMaterial.Rock:
        noiseFreq = 0.6; 
        noiseAmp = 0.3;
        movementSpeed = 0.3; // Slowed
        break;
      case VisualizerMaterial.Romance:
        noiseFreq = 0.4; 
        noiseAmp = 0.15;
        movementSpeed = 0.5; // Slowed
        break;
      case VisualizerMaterial.Glass:
        noiseFreq = 1.5;
        noiseAmp = 0.2;
        movementSpeed = 0.3; // Slowed
        break;
      default: 
        noiseFreq = 1.2 + (mood.cognition * 1.0);
        noiseAmp = 0.3;
        movementSpeed = 0.8; // Slowed
    }

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      vertex.normalize();
      
      // Slowed down movement factor
      const movement = time * (0.1 + mood.energy * 0.3) * movementSpeed;
      
      const noiseVal = noise3D(
        vertex.x * noiseFreq + movement,
        vertex.y * noiseFreq + movement,
        vertex.z * noiseFreq
      );

      let distortion = 0;
      
      if (materialType === VisualizerMaterial.Metal) {
        distortion = 0.8 + (Math.max(0, noiseVal) * noiseAmp * (1 + mood.energy));
      } else if (materialType === VisualizerMaterial.Rock) {
         distortion = 0.8 + (noiseVal * noiseAmp);
      } else {
         distortion = 0.8 + (noiseVal * noiseAmp) + (beatPulse * 0.1);
      }

      const pulseIntensity = materialType === VisualizerMaterial.Romance ? 0.05 : (0.1 + mood.energy * 0.2);
      const totalDistortion = distortion + (beatPulse * pulseIntensity);

      vertex.multiplyScalar(totalDistortion);
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();

    // Slowed down rotation
    const rotSpeed = materialType === VisualizerMaterial.Metal ? 0.005 : 0.001;
    meshRef.current.rotation.y += rotSpeed + (mood.energy * 0.003);
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
          emissiveIntensity={mood.euphoria * 0.4}
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
            clearcoatRoughness={0.1}
            transmission={0.2} 
         />
      )}

      {materialType === VisualizerMaterial.Glass && (
        <MeshTransmissionMaterial 
          backside
          samples={4}
          thickness={1.5}
          roughness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          transmission={1}
          ior={1.4}
          chromaticAberration={0.1}
          anisotropy={0.3}
          color={baseColor}
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
  const { size } = useThree();
  
  // Detect layout mode using window width
  const isMobileLayout = window.innerWidth < 768;

  // Responsive Logic
  let groupScale = 1.0;
  let groupPos: [number, number, number] = [0, 0, 0];

  if (isMobileLayout) {
    // Mobile: Sidebar at bottom (45vh), Player at top.
    // Lowered position significantly (negative Y) to clear the top media player area
    groupScale = 0.55; 
    groupPos = [0, -0.5, 0]; 
  } else {
    // Desktop/Tablet: Sidebar at right. Center vertically.
    groupPos = [0, 0, 0];
    
    // Scale adjustment for narrower desktop windows
    if (size.width < 600) {
      groupScale = 0.75;
    } else {
      groupScale = 0.9;
    }
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