import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { TwinState } from '../../lib/twin';

const COLORS = {
  soil: '#c9b892',
  soilDark: '#b3a27c',
  field: '#5f7e20',
  crop: '#7aa32a',
  cropDry: '#b99a3a',
  water: '#2f7fd8',
  waterDeep: '#1a5bb0',
  glass: '#cfe4f7',
  steel: '#7b8a93',
  pump: '#1d2a33',
  panel: '#173a63',
  wall: '#efeee9',
  palm: '#4f7a2a',
  trunk: '#8a6a45',
  ok: '#5f9e2c',
  cut: '#d6342c',
};

const TANK = { x: -2, z: -1, base: 4.1, height: 2.4, radius: 1.3 };

function skyColor(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 21) return new THREE.Color('#0d1a2c');
  if (h < 7) return new THREE.Color('#0d1a2c').lerp(new THREE.Color('#f2c69a'), (h - 5) / 2);
  if (h < 9) return new THREE.Color('#f2c69a').lerp(new THREE.Color('#bcd9f2'), (h - 7) / 2);
  if (h < 17) return new THREE.Color('#bcd9f2');
  if (h < 19) return new THREE.Color('#bcd9f2').lerp(new THREE.Color('#f0b27a'), (h - 17) / 2);
  return new THREE.Color('#f0b27a').lerp(new THREE.Color('#0d1a2c'), (h - 19) / 2);
}

function Sky({ hour }: { hour: number }) {
  const color = useMemo(() => skyColor(hour), [hour]);
  return <color attach="background" args={[color]} />;
}

function Sun({ hour }: { hour: number }) {
  const h = ((hour % 24) + 24) % 24;
  const angle = ((h - 6) / 12) * Math.PI;
  const up = Math.sin(angle);
  const light = Math.max(0.08, up);
  return (
    <>
      <hemisphereLight args={['#dfeeff', '#8a7a5a', 0.35 + 0.45 * light]} />
      <directionalLight position={[Math.cos(angle) * 18, Math.max(2, up * 22), 8]} intensity={0.25 + 1.6 * light} color={h > 17 || h < 8 ? '#ffd2a1' : '#ffffff'} />
    </>
  );
}

function Pipe({ points, radius = 0.09, color = COLORS.steel }: { points: THREE.Vector3[]; radius?: number; color?: string }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02), 96, radius, 10, false), [points, radius]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
    </mesh>
  );
}

/** Water drops travelling along a pipe while it flows. */
function Flow({ points, active, count = 28, speed = 0.18, reduced }: { points: THREE.Vector3[]; active: boolean; count?: number; speed?: number; reduced: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02), [points]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = active;
    if (!active) return;
    const t = reduced ? 0 : clock.getElapsedTime() * speed;
    for (let i = 0; i < count; i++) {
      const u = (i / count + t) % 1;
      dummy.position.copy(curve.getPointAt(u));
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.13, 10, 10]} />
      <meshStandardMaterial color={COLORS.water} emissive={COLORS.water} emissiveIntensity={0.35} />
    </instancedMesh>
  );
}

function Tank({ share }: { share: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const target = Math.max(0.02, Math.min(1, share));
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.scale.y += (target - m.scale.y) * 0.12;
    m.position.y = TANK.base + (TANK.height * m.scale.y) / 2;
  });
  return (
    <group>
      {/* tower */}
      {[
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[TANK.x + dx!, 2, TANK.z + dz!]}>
          <cylinderGeometry args={[0.07, 0.09, 4, 8]} />
          <meshStandardMaterial color={COLORS.steel} />
        </mesh>
      ))}
      <mesh position={[TANK.x, 1.6, TANK.z]}>
        <boxGeometry args={[1.9, 0.06, 1.9]} />
        <meshStandardMaterial color={COLORS.steel} />
      </mesh>
      <mesh position={[TANK.x, 4.03, TANK.z]}>
        <cylinderGeometry args={[1.45, 1.45, 0.12, 32]} />
        <meshStandardMaterial color={COLORS.steel} />
      </mesh>
      {/* water */}
      <mesh ref={ref} position={[TANK.x, TANK.base + (TANK.height * target) / 2, TANK.z]} scale={[1, target, 1]}>
        <cylinderGeometry args={[TANK.radius - 0.06, TANK.radius - 0.06, TANK.height, 40]} />
        <meshStandardMaterial color={COLORS.water} transparent opacity={0.88} roughness={0.15} />
      </mesh>
      {/* glass shell */}
      <mesh position={[TANK.x, TANK.base + TANK.height / 2, TANK.z]}>
        <cylinderGeometry args={[TANK.radius, TANK.radius, TANK.height, 40, 1, true]} />
        <meshStandardMaterial color={COLORS.glass} transparent opacity={0.22} side={THREE.DoubleSide} roughness={0.05} />
      </mesh>
      <mesh position={[TANK.x, TANK.base + TANK.height + 0.05, TANK.z]}>
        <cylinderGeometry args={[TANK.radius + 0.04, TANK.radius + 0.04, 0.1, 40]} />
        <meshStandardMaterial color={COLORS.steel} />
      </mesh>
    </group>
  );
}

function Pump({ on, reduced }: { on: boolean; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = on && !reduced ? 0.27 + Math.sin(clock.getElapsedTime() * 70) * 0.012 : 0.27;
  });
  return (
    <group ref={ref} position={[-4.6, 0.27, 2]}>
      <RoundedBox args={[0.9, 0.5, 0.6]} radius={0.08}>
        <meshStandardMaterial color={COLORS.pump} />
      </RoundedBox>
      <mesh position={[0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.2, 16]} />
        <meshStandardMaterial color={on ? '#3f84d6' : '#45545e'} emissive={on ? '#3f84d6' : '#000'} emissiveIntensity={on ? 0.5 : 0} />
      </mesh>
    </group>
  );
}

function Pylon({ gridOn }: { gridOn: boolean }) {
  const legs = useMemo(
    () =>
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ].map(([x, z]) => {
        const start = new THREE.Vector3(x! * 1.4, 0, z! * 1.4);
        const end = new THREE.Vector3(x! * 0.25, 7, z! * 0.25);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        const len = start.distanceTo(end);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
        return { mid, len, q };
      }),
    [],
  );
  const color = gridOn ? COLORS.ok : COLORS.cut;
  return (
    <group position={[-9.5, 0, -1]}>
      {legs.map((l, i) => (
        <mesh key={i} position={l.mid} quaternion={l.q}>
          <cylinderGeometry args={[0.05, 0.07, l.len, 6]} />
          <meshStandardMaterial color="#59656d" />
        </mesh>
      ))}
      {[2.2, 4.2].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[y === 4.2 ? 2.6 : 1.8, 0.06, 0.06]} />
          <meshStandardMaterial color="#59656d" />
        </mesh>
      ))}
      <mesh position={[0, 7.25, 0]}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 7.25, 0]} color={color} intensity={gridOn ? 2 : 6} distance={6} />
    </group>
  );
}

function SolarArray({ kw }: { kw: number }) {
  const glow = Math.min(1, kw / 20);
  return (
    <group position={[-6.5, 0, -4.5]}>
      {[-1.6, 1.6].map((x) => (
        <group key={x} position={[x, 1.1, 0]} rotation={[-0.55, 0, 0]}>
          <mesh>
            <boxGeometry args={[3, 0.07, 1.8]} />
            <meshStandardMaterial color={COLORS.panel} metalness={0.6} roughness={0.25} emissive="#2a6fd1" emissiveIntensity={0.05 + glow * 0.35} />
          </mesh>
        </group>
      ))}
      {[-2.8, 2.8].map((x) => (
        <mesh key={x} position={[x, 0.5, 0.2]}>
          <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
          <meshStandardMaterial color={COLORS.steel} />
        </mesh>
      ))}
    </group>
  );
}

function Field({ position, watered }: { position: [number, number, number]; watered: boolean }) {
  const crops = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) out.push([-1.6 + c * 0.53, -1 + r * 0.66]);
    return out;
  }, []);
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[4, 0.08, 3]} />
        <meshStandardMaterial color={watered ? '#6b5a3c' : COLORS.soilDark} />
      </mesh>
      {crops.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.32, z]}>
          <coneGeometry args={[0.16, 0.5, 6]} />
          <meshStandardMaterial color={COLORS.crop} />
        </mesh>
      ))}
    </group>
  );
}

function Palm({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 2.8, 8]} />
        <meshStandardMaterial color={COLORS.trunk} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos((i / 6) * Math.PI * 2) * 0.55, 2.8, Math.sin((i / 6) * Math.PI * 2) * 0.55]} rotation={[0, -(i / 6) * Math.PI * 2, Math.PI / 2.6]}>
          <coneGeometry args={[0.18, 1.3, 4]} />
          <meshStandardMaterial color={COLORS.palm} />
        </mesh>
      ))}
    </group>
  );
}

function House() {
  return (
    <group position={[-7.5, 0, 5]}>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[2.2, 1.4, 1.6]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>
      <mesh position={[0.3, 0.5, 0.81]}>
        <boxGeometry args={[0.5, 0.9, 0.02]} />
        <meshStandardMaterial color="#2a6fd1" />
      </mesh>
    </group>
  );
}

const UP_PIPE = [new THREE.Vector3(-4.6, 0.5, 2), new THREE.Vector3(-4.6, 5.6, 2), new THREE.Vector3(-4.0, 6.3, 1.0), new THREE.Vector3(-2.4, 6.6, -0.6)];
const GRAVITY_PIPE = [
  new THREE.Vector3(-2, 4.0, -1),
  new THREE.Vector3(-2, 0.35, -1),
  new THREE.Vector3(0, 0.25, -1),
  new THREE.Vector3(1.6, 0.25, -1),
  new THREE.Vector3(1.6, 0.25, 4.5),
];
const WELL_PIPE = [new THREE.Vector3(-6, 0.5, 2), new THREE.Vector3(-5.1, 0.35, 2)];
const POWER_LINE = [new THREE.Vector3(-9.5, 4.2, -1), new THREE.Vector3(-7, 2.8, 0.5), new THREE.Vector3(-4.6, 1.2, 2)];

export function TwinScene({ state, reduced }: { state: TwinState; reduced: boolean }) {
  return (
    <Canvas camera={{ position: [13, 9.5, 15], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
      <Sky hour={state.hour} />
      <fog attach="fog" args={[skyColor(state.hour), 28, 60]} />
      <Sun hour={state.hour} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={COLORS.soil} />
      </mesh>

      {/* the well basin */}
      <mesh position={[-6.6, 0.15, 2]}>
        <boxGeometry args={[1.8, 0.3, 1.4]} />
        <meshStandardMaterial color="#9a8a68" />
      </mesh>
      <mesh position={[-6.6, 0.31, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.6, 1.2]} />
        <meshStandardMaterial color={COLORS.waterDeep} />
      </mesh>

      <Pump on={state.pumpOn} reduced={reduced} />
      <Pipe points={WELL_PIPE} />
      <Pipe points={UP_PIPE} />
      <Pipe points={GRAVITY_PIPE} radius={0.11} />
      <Pipe points={POWER_LINE} radius={0.02} color="#2b3238" />
      <Flow points={UP_PIPE} active={state.pumpOn} reduced={reduced} />
      <Flow points={GRAVITY_PIPE} active={state.valveOpen} reduced={reduced} count={36} speed={0.22} />

      <Tank share={state.levelShare} />
      {/* valve */}
      <mesh position={[-2, 1.2, -1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.06, 10, 24]} />
        <meshStandardMaterial color={state.valveOpen ? COLORS.ok : '#59656d'} emissive={state.valveOpen ? COLORS.ok : '#000'} emissiveIntensity={state.valveOpen ? 0.5 : 0} />
      </mesh>

      <Pylon gridOn={state.gridOn} />
      <SolarArray kw={state.solarKW} />
      <Field position={[4, 0, -3.2]} watered={state.valveOpen} />
      <Field position={[4, 0, 0.3]} watered={state.valveOpen} />
      <Field position={[4, 0, 3.8]} watered={state.valveOpen} />
      <House />
      <Palm position={[8.5, 0, -6]} />
      <Palm position={[-10, 0, 6]} />
      <Palm position={[9, 0, 6.5]} />

      <Html position={[TANK.x, TANK.base + TANK.height + 0.9, TANK.z]} center distanceFactor={14}>
        <div className="whitespace-nowrap rounded-lg bg-black/70 px-2.5 py-1 text-[13px] font-medium text-white">Tank {Math.round(state.levelShare * 100)}%</div>
      </Html>
      <Html position={[-9.5, 8.3, -1]} center distanceFactor={14}>
        <div className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-medium text-white ${state.gridOn ? 'bg-black/70' : 'bg-[#d6342c]'}`}>{state.gridOn ? 'Grid on' : 'STEG cut'}</div>
      </Html>
      <Html position={[-4.6, 1.3, 2]} center distanceFactor={14}>
        <div className="whitespace-nowrap rounded-lg bg-black/70 px-2.5 py-1 text-[13px] font-medium text-white">
          {state.pumpOn ? `Pump on (${state.source === 'solar' ? 'sun' : state.source ?? 'grid'})` : 'Pump off'}
        </div>
      </Html>
      {state.valveOpen && (
        <Html position={[4, 1.4, 0.3]} center distanceFactor={14}>
          <div className="whitespace-nowrap rounded-lg bg-[#5f7e20] px-2.5 py-1 text-[13px] font-medium text-white">Gravity flow{state.farmer ? `: ${state.farmer}` : ''}</div>
        </Html>
      )}

      <OrbitControls target={[0, 2.2, 0]} enablePan={false} minDistance={10} maxDistance={32} maxPolarAngle={1.32} enableDamping />
    </Canvas>
  );
}
