import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { STEPS } from '../../lib/process';

/*
 * The olive waste, step by step. Stations:
 *   maâsra (press) → margine pond → tanker → thin film on the grove → soil cross-section
 *                  → grignon heap → drying yard → pelletizer → gasifier → dual-fuel engine → well → drip lines
 * Colour carries meaning: margine brown, grignon amber, oil gold, water cyan, olive leaves silver-green.
 */
const C = {
  margine: '#3a2414',
  margineLight: '#c08a52',
  grignonWet: new THREE.Color('#4a3020'),
  grignonDry: new THREE.Color('#a07a4e'),
  oil: '#e8b923',
  water: '#38bdf8',
  heat: '#f59e0b',
  fire: '#ff7a2f',
  leaf: '#8ea06a',
  leafGreen: new THREE.Color('#5fae46'),
  leafBase: new THREE.Color('#8ea06a'),
  trunk: '#5b4632',
  wall: '#efe9dd',
  blue: '#1b5fa8',
  steel: '#8a97a3',
  dark: '#2b3238',
};

const MILL: [number, number, number] = [0, 0, -9];
const POND: [number, number, number] = [-7, 0, -6];
const YARD: [number, number, number] = [8, 0, -6];
const PELLET: [number, number, number] = [11.5, 0, -1.5];
const GASIFIER: [number, number, number] = [9.5, 0, 2.5];
const ENGINE: [number, number, number] = [5.2, 0, 5.2];
const WELL: [number, number, number] = [6.8, 0, 7.4];
const GROVE = { x0: -4, x1: 4, z0: 5, z1: 10 };
const ROWS = [5.8, 7.3, 8.8];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Seconds since the current step started (resets on every step change). */
function useStepTime(step: number) {
  const start = useRef<number | null>(null);
  const t = useRef(0);
  useEffect(() => {
    start.current = null;
  }, [step]);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.getElapsedTime();
    t.current = clock.getElapsedTime() - start.current;
  });
  return t;
}

/* ── Shared bits ───────────────────────────────────────────────────── */

function Flow({ curve, active, color, count = 24, speed = 0.25, size = 0.09, reduced, shape = 'sphere' }: { curve: THREE.Curve<THREE.Vector3>; active: boolean; color: string; count?: number; speed?: number; size?: number; reduced: boolean; shape?: 'sphere' | 'box' }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const vis = useRef(0);
  useFrame(({ clock }, dt) => {
    const m = ref.current;
    if (!m) return;
    vis.current += ((active ? 1 : 0) - vis.current) * Math.min(1, dt * 3);
    m.visible = vis.current > 0.02;
    if (!m.visible) return;
    const t = reduced ? 0 : clock.getElapsedTime() * speed;
    for (let i = 0; i < count; i++) {
      const u = (i / count + t) % 1;
      o.position.copy(curve.getPointAt(u));
      o.scale.setScalar(vis.current * (0.75 + 0.25 * Math.sin(u * 30 + clock.getElapsedTime() * 4)));
      o.rotation.set(u * 10, u * 7, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      {shape === 'box' ? <boxGeometry args={[size * 1.6, size * 1.6, size * 1.6]} /> : <sphereGeometry args={[size, 8, 8]} />}
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
    </instancedMesh>
  );
}

function Pipe({ curve, radius = 0.08, color = C.steel, glow }: { curve: THREE.Curve<THREE.Vector3>; radius?: number; color?: string; glow?: string }) {
  const g = useMemo(() => new THREE.TubeGeometry(curve, 64, radius, 8, false), [curve, radius]);
  return (
    <mesh geometry={g}>
      <meshStandardMaterial color={color} metalness={0.45} roughness={0.45} emissive={glow ?? '#000'} emissiveIntensity={glow ? 0.35 : 0} transparent opacity={0.9} />
    </mesh>
  );
}

function Label({ position, text, show, tone = 'olive', value }: { position: [number, number, number]; text: string; show: boolean; tone?: string; value?: string }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`scene-badge ${show ? 'is-on' : ''}`} data-tone={tone}>
        <span className="dot dot-pulse" />
        <span className="scene-badge-label">{text}</span>
        {value && <b className="num">{value}</b>}
      </div>
    </Html>
  );
}

function Smoke({ position, color = '#d9d4cc', active, reduced, count = 6, height = 2.4 }: { position: [number, number, number]; color?: string; active: boolean; reduced: boolean; count?: number; height?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    g.children.forEach((c, i) => {
      const t = reduced ? i / count : (clock.getElapsedTime() * 0.3 + i / count) % 1;
      c.position.set(Math.sin(t * 5 + i) * 0.25 * t, t * height, 0);
      c.scale.setScalar(0.2 + t * 0.6);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t);
    });
  });
  return (
    <group ref={ref} position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.4, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ── 1. The maâsra: hopper, decanter, three outputs ────────────────── */

function Press({ step, reduced }: { step: number; reduced: boolean }) {
  const drum = useRef<THREE.Mesh>(null);
  const on = step === 0 || step === 8;
  useFrame((_, dt) => {
    if (drum.current && on && !reduced) drum.current.rotation.x += dt * 9;
  });
  const olives = useMemo(() => new THREE.LineCurve3(v(MILL[0] - 1.5, 4.2, MILL[2] + 3), v(MILL[0] - 1.5, 1.9, MILL[2] + 3)), []);
  const oilC = useMemo(() => new THREE.CatmullRomCurve3([v(0.9, 1.1, MILL[2] + 3), v(1.8, 0.9, MILL[2] + 3.2), v(2.6, 0.9, MILL[2] + 3.6)]), []);
  const grignonC = useMemo(() => new THREE.CatmullRomCurve3([v(1.2, 0.7, MILL[2] + 2.4), v(2.8, 0.55, MILL[2] + 1.8), v(4.2, 0.5, MILL[2] + 1.4)]), []);
  return (
    <group>
      <group position={MILL}>
        <mesh position={[0, 1.4, -0.4]}>
          <boxGeometry args={[6, 2.8, 3]} />
          <meshStandardMaterial color={C.wall} roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.88, -0.4]}>
          <boxGeometry args={[6.2, 0.16, 3.2]} />
          <meshStandardMaterial color="#ddd5c6" />
        </mesh>
        {[-2, -0.8, 2].map((x) => (
          <mesh key={x} position={[x, 1.7, 1.11]}>
            <boxGeometry args={[0.6, 0.6, 0.04]} />
            <meshStandardMaterial color={C.blue} />
          </mesh>
        ))}
        <mesh position={[0.8, 0.8, 1.11]}>
          <boxGeometry args={[1, 1.6, 0.04]} />
          <meshStandardMaterial color={C.blue} />
        </mesh>
        <mesh position={[2.2, 3.5, -1]}>
          <cylinderGeometry args={[0.2, 0.25, 1.4, 10]} />
          <meshStandardMaterial color="#cfc6b6" />
        </mesh>
        <Smoke position={[2.2, 4.2, -1]} active={on} reduced={reduced} />
      </group>
      {/* hopper and decanter in front of the mill, so the process is visible */}
      <mesh position={[MILL[0] - 1.5, 2.3, MILL[2] + 3]}>
        <coneGeometry args={[0.7, 1, 16, 1, true]} />
        <meshStandardMaterial color={C.steel} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <Flow curve={olives} active={on} color="#3d4a22" count={14} speed={0.6} size={0.12} reduced={reduced} />
      <mesh ref={drum} position={[MILL[0], 1.1, MILL[2] + 3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.5, 0.42, 3, 24]} />
        <meshStandardMaterial color="#b9c3cc" metalness={0.75} roughness={0.25} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 0.4, MILL[2] + 3]}>
          <boxGeometry args={[0.2, 0.8, 0.8]} />
          <meshStandardMaterial color={C.dark} />
        </mesh>
      ))}
      {/* oil tank */}
      <mesh position={[3, 0.7, MILL[2] + 3.8]}>
        <cylinderGeometry args={[0.55, 0.55, 1.4, 20]} />
        <meshStandardMaterial color="#d9dee3" metalness={0.6} roughness={0.3} />
      </mesh>
      <Flow curve={oilC} active={on} color={C.oil} count={10} speed={0.5} size={0.08} reduced={reduced} />
      {/* grignon conveyor and heap */}
      <Pipe curve={grignonC} radius={0.05} color={C.dark} />
      <Flow curve={grignonC} active={on || step === 5} color={C.margineLight} count={14} speed={0.3} size={0.09} reduced={reduced} shape="box" />
      <mesh position={[4.6, 0.45, MILL[2] + 1.2]}>
        <coneGeometry args={[0.9, 0.9, 16]} />
        <meshStandardMaterial color="#5c3c22" roughness={1} />
      </mesh>
      <Label position={[MILL[0], 4.4, MILL[2] + 1.6]} text="Maâsra" value="press" show={step === 0 || step === 8} tone="margine" />
      <Label position={[3, 2, MILL[2] + 3.8]} text="Olive oil" show={step === 0} tone="solar" />
      <Label position={[4.6, 1.7, MILL[2] + 1.2]} text="Fitoura" value="grignon" show={step === 0} tone="solar" />
    </group>
  );
}

/* ── 2. Pond and the lab sample ────────────────────────────────────── */

function Pond({ step, reduced }: { step: number; reduced: boolean }) {
  const surface = useRef<THREE.Mesh>(null);
  const pipe = useMemo(() => new THREE.CatmullRomCurve3([v(-1.2, 0.8, MILL[2] + 3), v(-3.5, 0.4, MILL[2] + 3.4), v(-5.4, 0.35, POND[2] - 0.6)]), []);
  useFrame(({ clock }) => {
    if (surface.current) surface.current.position.y = -0.25 + (reduced ? 0 : Math.sin(clock.getElapsedTime() * 0.8) * 0.01) - (step === 2 ? 0.1 : 0);
  });
  return (
    <group>
      <Pipe curve={pipe} radius={0.09} />
      <Flow curve={pipe} active={step <= 1 || step === 8} color={C.margineLight} count={18} speed={0.25} reduced={reduced} />
      <group position={POND}>
        {[
          [0, 1.6, 5.2, 0.3],
          [0, -1.6, 5.2, 0.3],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} position={[x!, 0.15, z!]}>
            <boxGeometry args={[w!, 0.3, d!]} />
            <meshStandardMaterial color="#8c7655" roughness={1} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 2.45, 0.15, 0]}>
            <boxGeometry args={[0.3, 0.3, 3]} />
            <meshStandardMaterial color="#8c7655" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, -0.4, 0]}>
          <boxGeometry args={[4.6, 0.8, 3]} />
          <meshStandardMaterial color="#20160e" />
        </mesh>
        <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
          <planeGeometry args={[4.6, 3]} />
          <meshStandardMaterial color={C.margine} emissive="#2a160a" emissiveIntensity={0.4} roughness={0.1} metalness={0.3} />
        </mesh>
        {/* lab sample */}
        <group position={[2.9, 0, 2]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.9, 0.7, 0.6]} />
            <meshStandardMaterial color="#e9edf1" />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.7, 16]} />
            <meshPhysicalMaterial color="#e6f4ff" transparent opacity={0.45} roughness={0.05} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.38, 16]} />
            <meshBasicMaterial color={C.margineLight} toneMapped={false} />
          </mesh>
          {step === 1 && !reduced && <Sparkles count={12} scale={[0.8, 0.8, 0.8]} position={[0, 1.2, 0]} size={3} speed={0.6} color={C.water} />}
        </group>
      </group>
      <Label position={[POND[0], 1.6, POND[2]]} text="Margine pond" show={step === 1 || step === 2 || step === 8} tone="margine" />
      <Label position={[POND[0] + 2.9, 2, POND[2] + 2]} text="Lab test" value="pH 4.9 · K 4.1 g/L" show={step === 1} tone="water" />
    </group>
  );
}

/* ── 3-4. The tanker: loads, drives, sprays a thin film ───────────── */

const ROAD = new THREE.CatmullRomCurve3([v(-5.2, 0, -3.4), v(-6, 0, 0), v(-5, 0, 3.2), v(-4.6, 0, 6.55)]);
const SPRAY_LINES = [6.55, 8.05];

function Tanker({ step, reduced }: { step: number; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const tank = useRef<THREE.MeshStandardMaterial>(null);
  const t = useStepTime(step);
  const hose = useMemo(() => new THREE.CatmullRomCurve3([v(POND[0] + 1.5, 0.3, POND[2] + 1.2), v(POND[0] + 1.9, 0.9, POND[2] + 2), v(-5.2, 1, -3.4)]), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let pos = v(-5.2, 0, -3.4);
    let yaw = 0;
    let loaded = false;
    const loop = step === 8 ? (t.current % 12) / 12 : null;
    if (step === 1) loaded = false;
    if (step === 2 || (loop !== null && loop < 0.4)) {
      const u = loop !== null ? loop / 0.4 : Math.min(1, Math.max(0, (t.current - 1.5) / 4.5));
      pos = ROAD.getPointAt(Math.min(0.999, u));
      const tan = ROAD.getTangentAt(Math.min(0.999, u));
      yaw = Math.atan2(tan.x, tan.z);
      loaded = true;
    } else if (step === 3 || (loop !== null && loop >= 0.4)) {
      const u = loop !== null ? (loop - 0.4) / 0.6 : Math.min(1, t.current / 7);
      const lane = u < 0.5 ? 0 : 1;
      const k = u < 0.5 ? u * 2 : (u - 0.5) * 2;
      const x = lane === 0 ? GROVE.x0 - 0.6 + k * 9 : GROVE.x1 + 0.6 - k * 9;
      pos = v(x, 0, SPRAY_LINES[lane]!);
      yaw = lane === 0 ? Math.PI / 2 : -Math.PI / 2;
      loaded = true;
    } else if (step >= 4) {
      pos = v(GROVE.x1 + 1.6, 0, 4.2);
      yaw = Math.PI;
    }
    g.position.lerp(pos, 0.25);
    g.rotation.y += (yaw - g.rotation.y) * 0.2;
    if (tank.current) tank.current.color.set(loaded ? C.margine : '#7b8794');
  });
  const spraying = step === 3 || step === 8;
  return (
    <>
      <Pipe curve={hose} radius={0.05} color={C.dark} />
      <Flow curve={hose} active={step === 1} color={C.margineLight} count={10} speed={0.4} size={0.06} reduced={reduced} />
      <group ref={ref} position={[-5.2, 0, -3.4]}>
        <RoundedBox args={[0.8, 0.7, 0.75]} radius={0.08} position={[0, 0.5, 0.95]}>
          <meshStandardMaterial color="#f3f4f6" />
        </RoundedBox>
        <mesh position={[0, 0.62, 1.33]}>
          <boxGeometry args={[0.66, 0.28, 0.02]} />
          <meshBasicMaterial color="#9fc6e8" />
        </mesh>
        <mesh position={[0, 0.62, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 1.75, 18]} />
          <meshStandardMaterial ref={tank} color={C.margine} metalness={0.5} roughness={0.35} />
        </mesh>
        {/* spray bar */}
        <mesh position={[0, 0.25, -1.25]}>
          <boxGeometry args={[1.8, 0.06, 0.06]} />
          <meshStandardMaterial color={C.dark} />
        </mesh>
        {spraying && !reduced && <Sparkles count={36} scale={[1.9, 0.35, 0.5]} position={[0, 0.12, -1.35]} size={3.2} speed={2} color={C.margineLight} />}
        {[-0.55, 0.85].map((wz) =>
          [-0.42, 0.42].map((wx) => (
            <mesh key={`${wz}${wx}`} position={[wx, 0.17, wz]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.17, 0.17, 0.12, 12]} />
              <meshStandardMaterial color="#1c2128" />
            </mesh>
          )),
        )}
      </group>
    </>
  );
}

/* ── 4-5. The grove, the thin film, the soil cross-section ─────────── */

function Grove({ step, reduced }: { step: number; reduced: boolean }) {
  const t = useStepTime(step);
  const films = useRef<Array<THREE.Mesh | null>>([]);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const trees = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (const z of ROWS) for (let x = GROVE.x0 + 0.6; x <= GROVE.x1 - 0.5; x += 1.15) out.push([x, z]);
    return out;
  }, []);
  useEffect(() => {
    const o = new THREE.Object3D();
    const trunks = crowns.current?.parent?.children.find((c) => c.name === 'trunks') as THREE.InstancedMesh | undefined;
    trees.forEach(([x, z], i) => {
      o.position.set(x, 0.4, z);
      o.scale.set(1, 1, 1);
      o.rotation.set(0, 0, 0.06);
      o.updateMatrix();
      trunks?.setMatrixAt(i, o.matrix);
      o.position.set(x, 1.05, z);
      o.scale.set(1, 0.8, 1);
      o.rotation.set(0, i, 0);
      o.updateMatrix();
      crowns.current?.setMatrixAt(i, o.matrix);
    });
    if (trunks) trunks.instanceMatrix.needsUpdate = true;
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
  }, [trees]);
  useFrame(() => {
    // The film grows behind the spray bar during step 4 and stays afterwards.
    films.current.forEach((m, lane) => {
      if (!m) return;
      let share = step > 3 ? 1 : 0;
      if (step === 3) share = Math.max(0, Math.min(1, (t.current / 7) * 2 - lane));
      if (step === 8) share = 1;
      m.scale.x = Math.max(0.001, share);
      m.position.x = lane === 0 ? GROVE.x0 + (8 * share) / 2 : GROVE.x1 - (8 * share) / 2;
    });
    // Leaves turn greener once the potassium reaches the roots.
    const mat = crowns.current?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.color.lerp(step >= 4 ? C.leafGreen : C.leafBase, 0.02);
  });
  return (
    <group>
      <mesh position={[0, 0.03, 7.5]}>
        <boxGeometry args={[8.4, 0.06, 5.4]} />
        <meshStandardMaterial color="#b29a6e" roughness={1} />
      </mesh>
      {SPRAY_LINES.map((z, lane) => (
        <mesh key={z} ref={(m) => (films.current[lane] = m)} position={[0, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 0.9]} />
          <meshStandardMaterial color="#4a2e18" transparent opacity={0.85} roughness={0.2} />
        </mesh>
      ))}
      <instancedMesh name="trunks" args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.07, 0.11, 0.8, 6]} />
        <meshStandardMaterial color={C.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, trees.length]}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color={C.leaf} roughness={0.85} flatShading />
      </instancedMesh>
      <SoilSection step={step} reduced={reduced} />
      <Label position={[0, 2.4, 7.5]} text="Olive grove" value={step >= 3 ? '10 m³/ha' : undefined} show={step === 3 || step === 8} tone="olive" />
    </group>
  );
}

function SoilSection({ step, reduced }: { step: number; reduced: boolean }) {
  const drops = useRef<THREE.InstancedMesh>(null);
  const kdots = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const N = 40;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: -3.6 + ((i * 0.618) % 1) * 7.2, d: (i * 0.371) % 1 })), []);
  const roots = useMemo(() => {
    const out: THREE.CatmullRomCurve3[] = [];
    for (let x = GROVE.x0 + 0.6; x <= GROVE.x1 - 0.5; x += 1.15) {
      out.push(new THREE.CatmullRomCurve3([v(x, 0, 10.21), v(x - 0.25, -0.45, 10.21), v(x - 0.5, -0.9, 10.21)]));
      out.push(new THREE.CatmullRomCurve3([v(x, 0, 10.21), v(x + 0.3, -0.5, 10.21), v(x + 0.55, -1.0, 10.21)]));
    }
    return out;
  }, []);
  const rootGeos = useMemo(() => roots.map((c) => new THREE.TubeGeometry(c, 12, 0.025, 5, false)), [roots]);
  useFrame(({ clock }) => {
    const on = step === 4 || step === 8;
    const t = reduced ? 0.5 : clock.getElapsedTime();
    [drops.current, kdots.current].forEach((m, kind) => {
      if (!m) return;
      m.visible = on;
      if (!on) return;
      for (let i = 0; i < N; i++) {
        const s = seeds[i]!;
        const u = (s.d + t * (kind === 0 ? 0.18 : 0.12)) % 1;
        // Margine soaks down a little and stops in the top layer; potassium drifts towards the roots.
        const y = kind === 0 ? -0.05 - u * 0.55 : -0.25 - Math.sin(u * Math.PI) * 0.45;
        const x = kind === 0 ? s.x : s.x + Math.sin(u * 6 + i) * 0.25;
        o.position.set(x, y, 10.22);
        o.scale.setScalar(kind === 0 ? 1 - u * 0.8 : 0.8);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <group>
      {/* layers of soil, cut open along the grove's front edge */}
      <mesh position={[0, -0.35, 10.0]}>
        <boxGeometry args={[8.4, 0.7, 0.4]} />
        <meshStandardMaterial color="#6e5236" roughness={1} />
      </mesh>
      <mesh position={[0, -1.2, 10.0]}>
        <boxGeometry args={[8.4, 1.0, 0.4]} />
        <meshStandardMaterial color="#a8865c" roughness={1} />
      </mesh>
      <mesh position={[0, -2.1, 10.0]}>
        <boxGeometry args={[8.4, 0.8, 0.4]} />
        <meshStandardMaterial color="#c7b089" roughness={1} />
      </mesh>
      {rootGeos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#3f2c1c" />
        </mesh>
      ))}
      <instancedMesh ref={drops} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={C.margineLight} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={kdots} args={[undefined, undefined, N]} frustumCulled={false}>
        <octahedronGeometry args={[0.07]} />
        <meshBasicMaterial color="#c6f36b" toneMapped={false} />
      </instancedMesh>
      <Label position={[-3, -0.2, 10.5]} text="Top soil" value="microbes at work" show={step === 4} tone="margine" />
      <Label position={[2.6, -0.6, 10.5]} text="Potassium" value="→ roots" show={step === 4} tone="olive" />
      <Label position={[0, -2.6, 10.5]} text="Groundwater stays clean" show={step === 4} tone="water" />
    </group>
  );
}

/* ── 6. Drying yard ────────────────────────────────────────────────── */

function DryingYard({ step, reduced }: { step: number; reduced: boolean }) {
  const t = useStepTime(step);
  const mats = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const conveyor = useMemo(() => new THREE.CatmullRomCurve3([v(4.8, 0.5, MILL[2] + 1.6), v(6.2, 0.3, -6.8), v(7, 0.25, -6)]), []);
  useFrame(() => {
    const dry = step > 5 ? 1 : step === 5 ? Math.min(1, t.current / 6) : 0;
    mats.current.forEach((m) => m?.color.copy(C.grignonWet.clone().lerp(C.grignonDry, dry)));
  });
  const moisture = step > 5 ? 10 : step === 5 ? null : 50;
  return (
    <group>
      <Flow curve={conveyor} active={step === 5 || step === 8} color={C.margineLight} count={10} speed={0.3} size={0.09} reduced={reduced} shape="box" />
      <group position={YARD}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[5.4, 0.1, 3.8]} />
          <meshStandardMaterial color="#cfc9bd" roughness={1} />
        </mesh>
        {[-1.3, -0.45, 0.45, 1.3].map((z, i) => (
          <mesh key={z} position={[0, 0.16, z]}>
            <boxGeometry args={[4.8, 0.12, 0.6]} />
            <meshStandardMaterial ref={(m) => (mats.current[i] = m)} color={C.grignonWet} roughness={1} />
          </mesh>
        ))}
        {step === 5 && !reduced && <Sparkles count={40} scale={[5, 2.5, 3.5]} position={[0, 1.4, 0]} size={3.5} speed={0.6} color={C.heat} />}
      </group>
      <Label position={[YARD[0], 1.8, YARD[2]]} text="Drying yard" value={moisture === null ? '50% → 10% water' : `${moisture}% water`} show={step === 5 || step === 8} tone="solar" />
    </group>
  );
}

/* ── 7. Pelletizer and gasifier ────────────────────────────────────── */

function PelletAndGas({ step, reduced }: { step: number; reduced: boolean }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const yardToPellet = useMemo(() => new THREE.CatmullRomCurve3([v(10.6, 0.3, -6), v(11.6, 0.4, -4.2), v(11.5, 1.9, -2.3)]), []);
  const pelletToGas = useMemo(() => new THREE.CatmullRomCurve3([v(11.5, 0.5, -0.7), v(11, 1.5, 0.8), v(9.9, 3.2, 2.2)]), []);
  const gasLine = useMemo(() => new THREE.CatmullRomCurve3([v(9.5, 3.3, 2.5), v(10.9, 3.1, 3.5), v(10.9, 1.4, 3.5), v(8.5, 0.9, 4.8), v(ENGINE[0] + 0.7, 0.7, ENGINE[2])]), []);
  const on = step === 6 || step === 7 || step === 8;
  useFrame(({ clock }) => {
    const k = on ? 0.75 + (reduced ? 0 : Math.sin(clock.getElapsedTime() * 6) * 0.25) : 0.15;
    if (glow.current) glow.current.opacity = k;
    if (light.current) light.current.intensity = on ? 6 * k : 0.5;
  });
  return (
    <group>
      <Flow curve={yardToPellet} active={step === 6 || step === 8} color={C.grignonDry.getStyle()} count={10} speed={0.35} size={0.08} reduced={reduced} shape="box" />
      <group position={PELLET}>
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[1.4, 1.6, 1.4]} />
          <meshStandardMaterial color="#4d6b7f" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.95, -0.6]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.6, 0.8, 14, 1, true]} />
          <meshStandardMaterial color={C.steel} side={THREE.DoubleSide} metalness={0.6} />
        </mesh>
      </group>
      <Flow curve={pelletToGas} active={step === 6 || step === 8} color={C.heat} count={14} speed={0.35} size={0.07} reduced={reduced} shape="box" />
      <group position={GASIFIER}>
        <mesh position={[0, 1.6, 0]}>
          <cylinderGeometry args={[0.8, 0.9, 3.2, 24]} />
          <meshStandardMaterial color="#59656d" metalness={0.55} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.92, 0.92, 0.5, 24, 1, true]} />
          <meshBasicMaterial ref={glow} color={C.fire} transparent opacity={0.3} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <pointLight ref={light} position={[0, 1, 1.2]} color={C.fire} distance={6} />
        {/* filter */}
        <mesh position={[1.4, 0.7, 1]}>
          <boxGeometry args={[0.8, 1.4, 0.8]} />
          <meshStandardMaterial color="#6f7d86" />
        </mesh>
      </group>
      <Pipe curve={gasLine} radius={0.1} glow={on ? C.heat : undefined} />
      <Flow curve={gasLine} active={step === 6 || step === 7 || step === 8} color={C.heat} count={26} speed={0.3} size={0.1} reduced={reduced} />
      <Label position={[PELLET[0], 2.8, PELLET[2]]} text="Pellets" show={step === 6} tone="solar" />
      <Label position={[GASIFIER[0], 3.9, GASIFIER[2]]} text="Gasifier" value="grignon → gas" show={step === 6 || step === 8} tone="solar" />
    </group>
  );
}

/* ── 8. Dual-fuel engine, well, drip lines ─────────────────────────── */

function EngineAndWell({ step, reduced }: { step: number; reduced: boolean }) {
  const block = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Mesh>(null);
  const on = step === 7 || step === 8;
  const riser = useMemo(() => new THREE.CatmullRomCurve3([v(WELL[0], -1.2, WELL[2]), v(WELL[0], 0.7, WELL[2]), v(WELL[0] - 0.8, 0.8, WELL[2] - 1.2), v(ENGINE[0] + 0.2, 0.6, ENGINE[2] + 0.6)]), []);
  const main = useMemo(() => new THREE.CatmullRomCurve3([v(ENGINE[0] - 0.4, 0.3, ENGINE[2] + 0.4), v(GROVE.x1 + 0.4, 0.15, 5.8), v(GROVE.x1, 0.12, 5.8)]), []);
  const drips = useMemo(() => ROWS.map((z) => new THREE.LineCurve3(v(GROVE.x1, 0.12, z), v(GROVE.x0, 0.12, z))), []);
  const feeder = useMemo(() => new THREE.LineCurve3(v(GROVE.x1, 0.12, 5.8), v(GROVE.x1, 0.12, 8.8)), []);
  useFrame(({ clock }, dt) => {
    if (block.current) block.current.position.y = on && !reduced ? Math.sin(clock.getElapsedTime() * 60) * 0.015 : 0;
    if (wheel.current && on && !reduced) wheel.current.rotation.z += dt * 12;
  });
  return (
    <group>
      <group ref={block} position={ENGINE}>
        <RoundedBox args={[1.6, 0.9, 1]} radius={0.1} position={[0, 0.45, 0]}>
          <meshStandardMaterial color="#1f2a35" metalness={0.4} roughness={0.5} />
        </RoundedBox>
        <mesh ref={wheel} position={[0.9, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.12, 16]} />
          <meshStandardMaterial color={on ? C.heat : '#45545e'} emissive={on ? C.heat : '#000'} emissiveIntensity={on ? 0.8 : 0} />
        </mesh>
        <mesh position={[-0.4, 1.2, -0.2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.6, 8]} />
          <meshStandardMaterial color="#59656d" />
        </mesh>
        <Smoke position={[-0.4, 1.5, -0.2]} active={on} reduced={reduced} count={4} height={1.4} color="#bfb8ad" />
        {on && <pointLight position={[0, 1.4, 0]} color={C.heat} intensity={3} distance={4} />}
      </group>
      <group position={WELL}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.7, 0.75, 0.6, 18, 1, true]} />
          <meshStandardMaterial color="#cfc6b4" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.65, 18]} />
          <meshStandardMaterial color="#1b4d7e" emissive="#1b4d7e" emissiveIntensity={0.7} />
        </mesh>
      </group>
      <Pipe curve={riser} radius={0.07} glow={on ? C.water : undefined} />
      <Flow curve={riser} active={on} color={C.water} count={16} speed={0.35} reduced={reduced} />
      <Pipe curve={main} radius={0.06} />
      <Flow curve={main} active={on} color={C.water} count={10} speed={0.4} size={0.07} reduced={reduced} />
      <Pipe curve={feeder} radius={0.04} />
      {drips.map((c, i) => (
        <group key={i}>
          <Pipe curve={c} radius={0.03} color="#222a30" />
          <Flow curve={c} active={on} color={C.water} count={16} speed={0.2} size={0.05} reduced={reduced} />
        </group>
      ))}
      <Label position={[ENGINE[0], 2.2, ENGINE[2]]} text="Well engine" value="−65% diesel" show={step === 7 || step === 8} tone="solar" />
      <Label position={[WELL[0], 1.5, WELL[2]]} text="Well water" value="drip to the grove" show={step === 7} tone="water" />
    </group>
  );
}

/* ── Camera ────────────────────────────────────────────────────────── */

/** Where the UI covers the screen, so the camera can frame the scene in the free part. */
export type Framing = 'page' | 'standalone';

/** View offset (fractions of the canvas) and a distance multiplier for each screen shape. */
function frame(framing: Framing, w: number, h: number): { x: number; y: number; dist: number } {
  const narrow = w < 768;
  if (framing === 'page') return narrow ? { x: 0, y: 0.03, dist: 1.6 } : { x: -0.16, y: 0.02, dist: 1 };
  const shortLandscape = w > h && h < 560;
  if (shortLandscape) return { x: -0.2, y: 0, dist: 1.15 }; // phone on its side: card on the left
  if (narrow) return { x: 0, y: 0.1, dist: 1.65 }; // phone upright: compact card at the bottom
  if (w < 1100) return { x: 0, y: 0.12, dist: 1.25 }; // tablet: card at the bottom
  return { x: -0.15, y: 0.02, dist: 1 }; // desktop: card on the left
}

function Rig({ step, reduced, framing }: { step: number; reduced: boolean; framing: Framing }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const flying = useRef(true);
  const first = useRef(true);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const tgt = useMemo(() => new THREE.Vector3(), []);
  const sph = useMemo(() => new THREE.Spherical(), []);
  useEffect(() => {
    flying.current = true;
  }, [step]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const p = STEPS[step]!.cam;
    // Leave room for the step card: the scene sits beside it on wide screens, above it on phones.
    const f = frame(framing, size.width, size.height);
    (camera as THREE.PerspectiveCamera).setViewOffset(size.width, size.height, f.x * size.width, f.y * size.height, size.width, size.height);
    tgt.set(...p.target);
    sph.set(p.r * f.dist, p.polar, p.az);
    desired.setFromSpherical(sph).add(tgt);
    if (!flying.current) {
      c.update();
      return;
    }
    const k = first.current || reduced ? 1 : 1 - Math.exp(-dt * 2.2);
    if (first.current) {
      camera.position.copy(desired).add(new THREE.Vector3(0, 20, 14));
      c.target.copy(tgt);
      first.current = false;
    } else {
      camera.position.lerp(desired, k);
      c.target.lerp(tgt, k);
    }
    c.update();
    if (camera.position.distanceTo(desired) < 0.05) flying.current = false;
  });
  return <OrbitControls ref={controls} enablePan={false} minDistance={5} maxDistance={70} maxPolarAngle={1.5} enableDamping dampingFactor={0.08} onStart={() => (flying.current = false)} />;
}

function Sky({ field }: { field: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color(field ? '#dbe9f2' : '#16304a');
  }, [field, scene]);
  return <fog attach="fog" args={[field ? '#dbe9f2' : '#16304a', 40, 110]} />;
}

/** Flat ground with a trench in front of the grove, so the soil cross-section can be seen. */
function Ground({ field }: { field: boolean }) {
  const col = field ? '#dcc9a2' : '#5a5040';
  const wall = field ? '#b9a07a' : '#4a3f30';
  const T = { x0: -4.2, x1: 4.2, z0: 10.2, z1: 14.6, depth: 2.5 };
  const slab = (x: number, z: number, w: number, d: number, key: string) => (
    <mesh key={key} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.01, z]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={col} roughness={1} />
    </mesh>
  );
  return (
    <group>
      {slab(0, (T.z0 - 200) / 2, 400, 200 + T.z0, 'back')}
      {slab(0, (T.z1 + 200) / 2, 400, 200 - T.z1, 'front')}
      {slab((T.x0 - 200) / 2, (T.z0 + T.z1) / 2, 200 + T.x0, T.z1 - T.z0, 'left')}
      {slab((T.x1 + 200) / 2, (T.z0 + T.z1) / 2, 200 - T.x1, T.z1 - T.z0, 'right')}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -T.depth, (T.z0 + T.z1) / 2]}>
        <planeGeometry args={[T.x1 - T.x0, T.z1 - T.z0]} />
        <meshStandardMaterial color={wall} roughness={1} />
      </mesh>
      {[T.x0, T.x1].map((x) => (
        <mesh key={x} position={[x, -T.depth / 2, (T.z0 + T.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[T.z1 - T.z0, T.depth]} />
          <meshStandardMaterial color={wall} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function ProcessScene({ step, reduced, field = false, framing = 'page' }: { step: number; reduced: boolean; field?: boolean; framing?: Framing }) {
  return (
    <Canvas camera={{ position: [20, 18, 26], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Sky field={field} />
      <hemisphereLight args={[field ? '#fff6e6' : '#bcd6ff', field ? '#b49a70' : '#2a2a3a', 0.75]} />
      <directionalLight position={[14, 22, 10]} intensity={1.7} color="#fff3dc" />
      <ambientLight intensity={0.18} />
      <Ground field={field} />
      <Press step={step} reduced={reduced} />
      <Pond step={step} reduced={reduced} />
      <Tanker step={step} reduced={reduced} />
      <Grove step={step} reduced={reduced} />
      <DryingYard step={step} reduced={reduced} />
      <PelletAndGas step={step} reduced={reduced} />
      <EngineAndWell step={step} reduced={reduced} />
      <Rig step={step} reduced={reduced} framing={framing} />
    </Canvas>
  );
}
