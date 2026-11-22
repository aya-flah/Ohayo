import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Buyer, Grove, Mill, ZitounInput } from '@sonae/shared';
import type { RegionState, ScenePose, TruckState } from '../../lib/scene';

/* Colour carries meaning: margine is brown, olive leaves are silver-green, water and rain are cyan,
   grignon heat is amber, anything forbidden or overflowing is coral. */
const C = {
  margine: '#3a2414',
  margineSheen: '#c08a52',
  leaf: '#8ea06a',
  leafDark: '#6d7f4c',
  trunk: '#5b4632',
  soilDry: new THREE.Color('#b29a6e'),
  soilWet: new THREE.Color('#4f3b26'),
  wall: '#efe9dd',
  blue: '#1b5fa8',
  water: '#38bdf8',
  grignon: '#6b4a2b',
  heat: '#f59e0b',
  cut: '#ff5a5f',
  ok: '#10b981',
};

/* ── Sky & light (shared look with the rest of the app) ─────────────── */

const SKIES = {
  glass: { night: '#04080f', dawn: '#2a2540', glow: '#6e4f55', day: '#1f4a6e', dusk: '#5a3a52', storm: '#1a2330' },
  field: { night: '#c9d2dc', dawn: '#f1d9c4', glow: '#f3dcc2', day: '#dbe9f2', dusk: '#f2d2b8', storm: '#a9b3bd' },
};

function skyColor(hour: number, field: boolean, rain: number) {
  const S = SKIES[field ? 'field' : 'glass'];
  const c = (k: keyof typeof S) => new THREE.Color(S[k]);
  const h = ((hour % 24) + 24) % 24;
  let col: THREE.Color;
  if (h < 5 || h >= 21) col = c('night');
  else if (h < 6.5) col = c('night').lerp(c('dawn'), (h - 5) / 1.5);
  else if (h < 8) col = c('dawn').lerp(c('glow'), (h - 6.5) / 1.5);
  else if (h < 10) col = c('glow').lerp(c('day'), (h - 8) / 2);
  else if (h < 17) col = c('day');
  else if (h < 19) col = c('day').lerp(c('dusk'), (h - 17) / 2);
  else col = c('dusk').lerp(c('night'), (h - 19) / 2);
  return col.lerp(c('storm'), rain * 0.75);
}

function Atmosphere({ hour, field, rain }: { hour: number; field: boolean; rain: number }) {
  const { scene } = useThree();
  const target = useMemo(() => skyColor(hour, field, rain), [hour, field, rain]);
  useFrame(() => {
    if (!(scene.background instanceof THREE.Color)) scene.background = target.clone();
    (scene.background as THREE.Color).lerp(target, 0.06);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background as THREE.Color);
  });
  return <fog attach="fog" args={[target, 60, 150]} />;
}

function Celestial({ hour, field, rain }: { hour: number; field: boolean; rain: number }) {
  const h = ((hour % 24) + 24) % 24;
  const angle = ((h - 6) / 12) * Math.PI;
  const up = Math.sin(angle);
  const light = Math.max(0.06, up) * (1 - rain * 0.55);
  const night = h < 5.5 || h > 20;
  return (
    <>
      <hemisphereLight args={[field ? '#fff6e6' : '#bcd6ff', field ? '#b49a70' : '#2a2a3a', 0.35 + 0.5 * light]} />
      <directionalLight position={[Math.cos(angle) * 24, Math.max(4, up * 30), 10]} intensity={0.25 + 1.6 * light} color={h > 17 || h < 8.5 ? '#ffc999' : '#ffffff'} />
      <ambientLight intensity={night ? 0.2 : 0.14} color={night ? '#6d8fd8' : '#ffffff'} />
      {up > -0.1 && rain < 0.5 && (
        <mesh position={[Math.cos(angle) * 46, Math.max(-4, up * 34), -40]}>
          <sphereGeometry args={[2.2, 32, 32]} />
          <meshBasicMaterial color={h > 17 || h < 8.5 ? '#ffb070' : '#fff1c9'} toneMapped={false} />
        </mesh>
      )}
      {night && !field && rain < 0.3 && <Stars radius={110} depth={40} count={1600} factor={3.2} saturation={0} fade speed={0.4} />}
    </>
  );
}

/* ── Paths ───────────────────────────────────────────────────────────── */

const v3 = (p: [number, number], y = 0.05) => new THREE.Vector3(p[0], y, p[1]);

/** A gently bending dirt track between two places (same curve for the road and the truck). */
function routeCurve(a: [number, number], b: [number, number]) {
  const A = v3(a);
  const B = v3(b);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dir = B.clone().sub(A);
  const normal = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(dir.length() * 0.12);
  return new THREE.QuadraticBezierCurve3(A, mid.add(normal), B);
}

function Road({ a, b, field }: { a: [number, number]; b: [number, number]; field: boolean }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(routeCurve(a, b), 48, 0.12, 4, false), [a, b]);
  return (
    <mesh geometry={geometry} scale={[1, 0.15, 1]}>
      <meshStandardMaterial color={field ? '#a8946c' : '#3d372d'} roughness={1} />
    </mesh>
  );
}

const WADI = [
  [-30, 17],
  [-20, 15.5],
  [-12, 16],
  [-5, 17.2],
  [1, 15],
  [6, 12.4],
  [11, 13.6],
  [17, 16],
  [30, 18],
] as Array<[number, number]>;

function Wadi({ rain, polluted, reduced }: { rain: number; polluted: boolean; reduced: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(WADI.map((p) => v3(p, 0.03))), []);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.9, 6, false), [curve]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    const target = new THREE.Color(polluted ? '#5a3a1e' : rain > 0 ? '#2f86c4' : '#3b5566');
    m.color.lerp(target, Math.min(1, dt * 2));
    m.emissiveIntensity += ((rain > 0 ? 0.35 : 0.08) - m.emissiveIntensity) * Math.min(1, dt * 2);
  });
  return (
    <group>
      <mesh geometry={geometry} scale={[1, 0.06, 1]}>
        <meshStandardMaterial ref={mat} color="#3b5566" emissive={polluted ? '#3a2414' : '#1b4d7e'} emissiveIntensity={0.08} roughness={0.25} metalness={0.1} />
      </mesh>
      <Flow curve={curve} active={rain > 0 || polluted} color={polluted ? C.margineSheen : C.water} count={60} speed={0.03 + rain * 0.05} size={0.16} reduced={reduced} />
    </group>
  );
}

/** Glowing particles running along a curve. */
function Flow({ curve, active, color, count = 28, speed = 0.18, size = 0.12, reduced }: { curve: THREE.Curve<THREE.Vector3>; active: boolean; color: string; count?: number; speed?: number; size?: number; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const vis = useRef(0);
  useFrame(({ clock }, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    vis.current += ((active ? 1 : 0) - vis.current) * Math.min(1, dt * 3);
    mesh.visible = vis.current > 0.02;
    if (!mesh.visible) return;
    const t = reduced ? 0 : clock.getElapsedTime() * speed;
    for (let i = 0; i < count; i++) {
      const u = (i / count + t) % 1;
      dummy.position.copy(curve.getPointAt(u));
      dummy.position.y += 0.12;
      dummy.scale.setScalar(vis.current * (0.7 + 0.3 * Math.sin(u * 40 + clock.getElapsedTime() * 3)));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── The maâsra: building, margine pond, grignon heap ───────────────── */

function Smoke({ position, color = '#d9d4cc', active, reduced, count = 6 }: { position: [number, number, number]; color?: string; active: boolean; reduced: boolean; count?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    g.children.forEach((child, i) => {
      const t = reduced ? i / count : (clock.getElapsedTime() * 0.25 + i / count) % 1;
      child.position.set(Math.sin(t * 5 + i) * 0.25 * t, t * 2.6, Math.cos(t * 4) * 0.2 * t);
      child.scale.setScalar(0.25 + t * 0.7);
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t);
    });
  });
  return (
    <group ref={ref} position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.45, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function MillModel({ mill, share, overflow, grignonT, reduced, badges }: { mill: Mill; share: number; overflow: boolean; grignonT: number; reduced: boolean; badges: boolean }) {
  const surface = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [x, z] = mill.pos;
  const PW = 3.6;
  const PD = 2.6;
  const depth = 0.7;
  useFrame(({ clock }, dt) => {
    const s = surface.current;
    if (s) {
      const target = -depth + 0.02 + Math.min(1, share) * (depth + 0.06);
      s.position.y += (target - s.position.y) * Math.min(1, dt * 3);
    }
    if (ring.current) {
      ring.current.visible = overflow || share >= 0.9;
      const k = reduced ? 0.5 : (clock.getElapsedTime() * 0.8) % 1;
      ring.current.scale.setScalar(1 + k * 0.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (overflow ? 0.9 : 0.5) * (1 - k);
    }
  });
  const heap = Math.max(0.35, Math.min(1.6, Math.sqrt(grignonT / 40)));
  const tone = overflow || share >= 0.9 ? 'cut' : share >= 0.75 ? 'solar' : 'margine';
  return (
    <group position={[x, 0, z]}>
      {/* building: whitewashed walls, Tunisian blue door and windows */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[3.4, 2, 2.4]} />
        <meshStandardMaterial color={C.wall} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.08, 0]}>
        <boxGeometry args={[3.6, 0.16, 2.6]} />
        <meshStandardMaterial color="#ddd5c6" />
      </mesh>
      <mesh position={[0.6, 0.65, 1.21]}>
        <boxGeometry args={[0.8, 1.3, 0.04]} />
        <meshStandardMaterial color={C.blue} />
      </mesh>
      {[-1.1, -0.4].map((wx) => (
        <mesh key={wx} position={[wx, 1.3, 1.21]}>
          <boxGeometry args={[0.45, 0.45, 0.04]} />
          <meshStandardMaterial color={C.blue} />
        </mesh>
      ))}
      <mesh position={[1.2, 2.7, -0.6]}>
        <cylinderGeometry args={[0.18, 0.22, 1.4, 10]} />
        <meshStandardMaterial color="#cfc6b6" />
      </mesh>
      <Smoke position={[1.2, 3.4, -0.6]} active reduced={reduced} />
      {/* margine pond with an earth berm */}
      <group position={[0, 0, -3.1]}>
        {[
          [0, PD / 2 + 0.15, PW + 0.6, 0.3],
          [0, -PD / 2 - 0.15, PW + 0.6, 0.3],
        ].map(([px, pz, w, d], i) => (
          <mesh key={i} position={[px!, 0.15, pz!]}>
            <boxGeometry args={[w!, 0.3, d!]} />
            <meshStandardMaterial color="#8c7655" roughness={1} />
          </mesh>
        ))}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (PW / 2 + 0.15), 0.15, 0]}>
            <boxGeometry args={[0.3, 0.3, PD]} />
            <meshStandardMaterial color="#8c7655" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, -depth / 2, 0]}>
          <boxGeometry args={[PW, depth, PD]} />
          <meshStandardMaterial color="#2a1e14" roughness={1} />
        </mesh>
        <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, -depth + 0.02 + share * (depth + 0.06), 0]}>
          <planeGeometry args={[PW, PD]} />
          <meshStandardMaterial color={C.margine} emissive={overflow ? C.cut : '#2a160a'} emissiveIntensity={overflow ? 0.6 : 0.4} roughness={0.12} metalness={0.3} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
          <ringGeometry args={[2.3, 2.45, 48]} />
          <meshBasicMaterial color={C.cut} transparent opacity={0.6} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      {/* grignon heap */}
      <mesh position={[-2.6, heap * 0.45, 0.4]}>
        <coneGeometry args={[heap, heap * 0.9, 16]} />
        <meshStandardMaterial color={C.grignon} roughness={1} />
      </mesh>
      <Badge show={badges} position={[0, 3.4, -3.1]} tone={tone} label={mill.name.replace('Maâsra ', '')} value={`${Math.round(share * 100)}%`} />
    </group>
  );
}

/* ── Olive groves (instanced trees) ─────────────────────────────────── */

function grovePatch(g: Grove) {
  const side = Math.max(2.6, Math.sqrt(g.areaHa) * 1.25);
  return { w: side * 1.25, d: side };
}

function treePositions(groves: Grove[]) {
  const pts: Array<{ x: number; z: number; s: number; tilt: number }> = [];
  for (const g of groves) {
    const { w, d } = grovePatch(g);
    const step = 0.95;
    const tilt = g.slopePct > 8 ? 0.22 : 0;
    for (let ix = 0; ix * step < w - 0.4; ix++) {
      for (let iz = 0; iz * step < d - 0.4; iz++) {
        const lx = -w / 2 + 0.5 + ix * step;
        const lz = -d / 2 + 0.5 + iz * step;
        const h = Math.sin((ix * 7 + iz * 13) * 1.7) * 0.5 + 0.5;
        pts.push({ x: g.pos[0] + lx, z: g.pos[1] + lz, s: 0.75 + h * 0.35, tilt: tilt * lz });
      }
    }
  }
  return pts;
}

function Trees({ groves }: { groves: Grove[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => treePositions(groves), [groves]);
  useEffect(() => {
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      o.position.set(p.x, 0.35 * p.s + p.tilt, p.z);
      o.scale.set(p.s, p.s, p.s);
      o.rotation.set(0, 0, 0.08);
      o.updateMatrix();
      trunks.current?.setMatrixAt(i, o.matrix);
      o.position.set(p.x, 0.95 * p.s + p.tilt, p.z);
      o.scale.set(p.s * 1.05, p.s * 0.8, p.s * 1.05);
      o.rotation.set(0, i, 0);
      o.updateMatrix();
      crowns.current?.setMatrixAt(i, o.matrix);
      crowns.current?.setColorAt(i, new THREE.Color(i % 3 === 0 ? C.leafDark : C.leaf));
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    }
  }, [pts]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, pts.length]}>
        <cylinderGeometry args={[0.06, 0.1, 0.7, 6]} />
        <meshStandardMaterial color={C.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, pts.length]}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
    </>
  );
}

function GrovePatch({ grove, share, allowed, reason, receiving, todayM3, reduced, badges }: { grove: Grove; share: number; allowed: boolean; reason: string | null; receiving: boolean; todayM3: number; reduced: boolean; badges: boolean }) {
  const { w, d } = grovePatch(grove);
  const soil = useRef<THREE.MeshStandardMaterial>(null);
  const sheen = useRef<THREE.MeshBasicMaterial>(null);
  const tilt = grove.slopePct > 8 ? -0.22 : 0;
  useFrame(({ clock }, dt) => {
    if (soil.current) soil.current.color.lerp(C.soilDry.clone().lerp(C.soilWet, Math.min(1, share * 0.9)), Math.min(1, dt * 2));
    if (sheen.current) {
      const target = receiving ? 0.35 + (reduced ? 0 : Math.sin(clock.getElapsedTime() * 4) * 0.1) : 0;
      sheen.current.opacity += (target - sheen.current.opacity) * Math.min(1, dt * 4);
    }
  });
  return (
    <group position={[grove.pos[0], 0, grove.pos[1]]}>
      <group rotation={[tilt, 0, 0]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[w, 0.08, d]} />
          <meshStandardMaterial ref={soil} color={C.soilDry} roughness={1} />
        </mesh>
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial ref={sheen} color={C.margineSheen} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
        {!allowed && (
          <lineSegments position={[0, 0.12, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(w + 0.3, 0.01, d + 0.3)]} />
            <lineBasicMaterial color={C.cut} />
          </lineSegments>
        )}
      </group>
      {receiving && !reduced && <Sparkles count={20} scale={[w, 0.6, d]} position={[0, 0.4, 0]} size={2.6} speed={0.5} color={C.margineSheen} opacity={0.8} />}
      <Badge
        show={badges}
        position={[0, 2.2, 0]}
        tone={!allowed ? 'cut' : receiving ? 'margine' : 'olive'}
        label={grove.owner.split(' ')[0]!}
        value={!allowed ? (reason?.includes('well') ? 'Well' : reason?.includes('wadi') ? 'Wadi' : 'Slope') : receiving ? `+${Math.round(todayM3)} m³` : `${Math.round(share * 100)}%`}
      />
    </group>
  );
}

/* ── Buyers of grignon ──────────────────────────────────────────────── */

function BuyerModel({ buyer, served, reduced, badges }: { buyer: Buyer; served: boolean; reduced: boolean; badges: boolean }) {
  const [x, z] = buyer.pos;
  const label = buyer.kind === 'hammam' ? 'Hammam' : buyer.kind === 'bakery' ? 'Bakery' : buyer.kind === 'kiln' ? 'Kiln' : 'Greenhouses';
  return (
    <group position={[x, 0, z]}>
      {buyer.kind === 'hammam' && (
        <>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[2.4, 1.6, 2.4]} />
            <meshStandardMaterial color={C.wall} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#f6f1e7" />
          </mesh>
          <mesh position={[0.4, 0.55, 1.21]}>
            <boxGeometry args={[0.6, 1.1, 0.04]} />
            <meshStandardMaterial color={C.blue} />
          </mesh>
        </>
      )}
      {buyer.kind === 'bakery' && (
        <>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[2.2, 1.4, 1.8]} />
            <meshStandardMaterial color="#f1e6cf" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.5, 0.91]}>
            <boxGeometry args={[0.9, 0.5, 0.04]} />
            <meshBasicMaterial color={C.heat} toneMapped={false} />
          </mesh>
        </>
      )}
      {buyer.kind === 'kiln' && (
        <>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[1.2, 1.5, 2, 16]} />
            <meshStandardMaterial color="#9a6a4a" roughness={1} />
          </mesh>
          <mesh position={[0, 0.5, 1.4]}>
            <boxGeometry args={[0.8, 0.6, 0.1]} />
            <meshBasicMaterial color="#ff8a3d" toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0.8, 2]} color="#ff8a3d" intensity={served ? 6 : 2.5} distance={5} />
        </>
      )}
      {buyer.kind === 'greenhouse' &&
        [-1.1, 1.1].map((gx) => (
          <mesh key={gx} position={[gx, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.9, 0.9, 3.2, 18, 1, true, 0, Math.PI]} />
            <meshPhysicalMaterial color="#dff3ff" transparent opacity={0.45} side={THREE.DoubleSide} roughness={0.1} />
          </mesh>
        ))}
      <mesh position={[1, buyer.kind === 'greenhouse' ? 1 : 2.2, -0.6]}>
        <cylinderGeometry args={[0.13, 0.16, 1, 8]} />
        <meshStandardMaterial color="#bdb4a4" />
      </mesh>
      <Smoke position={[1, buyer.kind === 'greenhouse' ? 1.6 : 2.8, -0.6]} color={served ? '#e8b46a' : '#cfcac2'} active reduced={reduced} count={served ? 7 : 4} />
      <Badge show={badges} position={[0, 3.6, 0]} tone="solar" label={label} value={served ? 'Grignon in' : undefined} />
    </group>
  );
}

/* ── Trucks ─────────────────────────────────────────────────────────── */

function Truck({ t, reduced }: { t: TruckState; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const curve = useMemo(() => routeCurve(t.from, t.to), [t.from, t.to]);
  const phase = useRef(t.phase);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    phase.current += (t.phase - phase.current) * Math.min(1, dt * 6);
    const p = phase.current;
    const u = p < 0.45 ? p / 0.45 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    const uu = Math.max(0.001, Math.min(0.999, u));
    const pos = curve.getPointAt(uu);
    const tan = curve.getTangentAt(uu);
    if (p >= 0.55) tan.negate();
    g.position.set(pos.x, 0.05, pos.z);
    g.rotation.y = Math.atan2(tan.x, tan.z);
  });
  const isG = t.kind === 'grignon';
  return (
    <group ref={ref}>
      <RoundedBox args={[0.8, 0.7, 0.75]} radius={0.08} position={[0, 0.5, 0.95]}>
        <meshStandardMaterial color={isG ? '#e9e2d4' : '#f3f4f6'} />
      </RoundedBox>
      <mesh position={[0, 0.62, 1.33]}>
        <boxGeometry args={[0.66, 0.28, 0.02]} />
        <meshBasicMaterial color="#9fc6e8" />
      </mesh>
      {isG ? (
        <group position={[0, 0.45, -0.25]}>
          <mesh>
            <boxGeometry args={[0.95, 0.5, 1.7]} />
            <meshStandardMaterial color="#5c6670" />
          </mesh>
          {t.loaded && (
            <mesh position={[0, 0.3, 0]}>
              <boxGeometry args={[0.85, 0.2, 1.55]} />
              <meshStandardMaterial color={C.grignon} roughness={1} />
            </mesh>
          )}
        </group>
      ) : (
        <mesh position={[0, 0.62, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 1.75, 18]} />
          <meshStandardMaterial color={t.loaded ? C.margine : '#7b8794'} metalness={0.5} roughness={0.35} emissive={t.loaded ? '#24130a' : '#000'} />
        </mesh>
      )}
      {[-0.55, 0.85].map((wz) =>
        [-0.42, 0.42].map((wx) => (
          <mesh key={`${wz}${wx}`} position={[wx, 0.17, wz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.17, 0.17, 0.12, 12]} />
            <meshStandardMaterial color="#1c2128" />
          </mesh>
        )),
      )}
      <pointLight position={[0, 1.2, 0]} color={isG ? C.heat : C.margineSheen} intensity={t.unloading ? 5 : 1.2} distance={3} />
      {t.unloading && !reduced && !isG && <Sparkles count={14} scale={[1.2, 0.5, 1.6]} position={[0, 0.3, -1.1]} size={3} speed={1.2} color={C.margineSheen} />}
    </group>
  );
}

/* ── Rain ───────────────────────────────────────────────────────────── */

function Rain({ intensity, reduced }: { intensity: number; reduced: boolean }) {
  const count = 900;
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ x: Math.sin(i * 12.9898) * 32, z: Math.cos(i * 78.233) * 26, o: (i * 0.618) % 1 })), []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    m.visible = intensity > 0.02;
    if (!m.visible) return;
    const n = Math.floor(count * intensity);
    const t = reduced ? 0 : clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const y = 16 - ((s.o * 16 + t * 14) % 16);
      o.position.set(s.x, i < n ? y : -50, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.025, 0.55, 0.025]} />
        <meshBasicMaterial color="#9fd8ff" transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      {intensity > 0.02 &&
        [
          [-12, 17, -4],
          [0, 18, 4],
          [12, 17, -2],
          [-4, 19, -12],
          [8, 18, 10],
        ].map(([x, y, z], i) => (
          <group key={i} position={[x!, y!, z!]}>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} position={[(k - 1.5) * 2.2, Math.sin(k) * 0.5, Math.cos(k * 2) * 1.2]}>
                <sphereGeometry args={[2.4 - (k % 2) * 0.6, 14, 14]} />
                <meshStandardMaterial color="#5d6875" transparent opacity={0.35 + intensity * 0.45} depthWrite={false} />
              </mesh>
            ))}
          </group>
        ))}
    </>
  );
}

/* ── Badges ─────────────────────────────────────────────────────────── */

type BadgeTone = 'water' | 'ok' | 'solar' | 'cut' | 'idle' | 'margine' | 'olive';

function Badge({ position, tone, label, value, show }: { position: [number, number, number]; tone: BadgeTone; label: string; value?: string; show: boolean }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`scene-badge ${show ? 'is-on' : ''}`} data-tone={tone}>
        <span className="dot dot-pulse" />
        <span className="scene-badge-label">{label}</span>
        {value && <b className="num">{value}</b>}
      </div>
    </Html>
  );
}

/* ── Camera rig ─────────────────────────────────────────────────────── */

interface Pose {
  target: [number, number, number];
  r: number;
  polar: number;
  az: number;
  shift: [number, number];
  mobileShift?: [number, number];
  mobileR?: number;
}

const POSES: Record<ScenePose, Pose> = {
  plan: { target: [0, 0, 0], r: 52, polar: 0.95, az: 0.55, shift: [0.2, 0.22], mobileShift: [0, 0.26], mobileR: 62 },
  twin: { target: [0, 0, -1], r: 46, polar: 0.92, az: 0.5, shift: [-0.04, -0.02], mobileShift: [0, -0.08], mobileR: 78 },
  yui: { target: [-4, 0, -2], r: 40, polar: 1.0, az: -0.35, shift: [0.22, 0.12], mobileShift: [0, 0.24], mobileR: 56 },
  replay: { target: [0, 0, 0], r: 60, polar: 0.6, az: 1.0, shift: [0.2, 0.22], mobileShift: [0, 0.28], mobileR: 70 },
  settings: { target: [-10, 1, -7], r: 18, polar: 1.15, az: 1.4, shift: [0.24, 0.06], mobileShift: [0, 0.2], mobileR: 26 },
};

function Rig({ pose, interactive, reduced }: { pose: ScenePose; interactive: boolean; reduced: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const flying = useRef(true);
  const first = useRef(true);
  const shift = useRef<[number, number]>([0, 0]);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const tgt = useMemo(() => new THREE.Vector3(), []);
  const sph = useMemo(() => new THREE.Spherical(), []);

  useEffect(() => {
    flying.current = true;
  }, [pose]);

  useFrame(({ clock }, dt) => {
    const c = controls.current;
    if (!c) return;
    const p = POSES[pose];
    const narrow = size.width < 768;
    const k = first.current || reduced ? 1 : 1 - Math.exp(-dt * 1.8);
    const want = narrow ? (p.mobileShift ?? [0, 0]) : p.shift;
    shift.current = [shift.current[0] + (want[0] - shift.current[0]) * k, shift.current[1] + (want[1] - shift.current[1]) * k];
    (camera as THREE.PerspectiveCamera).setViewOffset(size.width, size.height, -shift.current[0] * size.width, shift.current[1] * size.height, size.width, size.height);
    const drift = !interactive && !reduced ? Math.sin(clock.getElapsedTime() * 0.05) * 0.2 : 0;
    tgt.set(...p.target);
    sph.set(narrow ? (p.mobileR ?? p.r * 1.3) : p.r, p.polar, p.az + drift);
    desired.setFromSpherical(sph).add(tgt);
    if (interactive && !flying.current) {
      c.update();
      return;
    }
    if (first.current) {
      camera.position.copy(desired).add(new THREE.Vector3(0, 30, 18));
      c.target.copy(tgt);
      first.current = false;
    } else {
      camera.position.lerp(desired, k);
      c.target.lerp(tgt, k);
    }
    c.update();
    if (interactive && camera.position.distanceTo(desired) < 0.1) flying.current = false;
  });

  return (
    <OrbitControls
      ref={controls}
      enabled={interactive}
      enablePan={false}
      minDistance={12}
      maxDistance={95}
      maxPolarAngle={1.35}
      enableDamping
      dampingFactor={0.08}
      onStart={() => {
        flying.current = false;
      }}
    />
  );
}

/* ── The scene ──────────────────────────────────────────────────────── */

export interface ZitounSceneProps {
  input: ZitounInput;
  state: RegionState;
  grignonStock: Record<string, number>;
  reduced: boolean;
  pose?: ScenePose;
  interactive?: boolean;
  field?: boolean;
  badges?: boolean;
}

const WELL: [number, number] = [-1.4, -1.0];

export function ZitounScene({ input, state, grignonStock, reduced, pose = 'twin', interactive = true, field = false, badges = true }: ZitounSceneProps) {
  const routes = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; a: [number, number]; b: [number, number] }> = [];
    for (const m of input.mills) {
      for (const g of input.groves) {
        const key = `${m.id}-${g.id}`;
        const d = Math.hypot(m.pos[0] - g.pos[0], m.pos[1] - g.pos[1]);
        if (d < 15 && !seen.has(key)) {
          seen.add(key);
          out.push({ key, a: m.pos, b: g.pos });
        }
      }
      for (const b of input.buyers) out.push({ key: `${m.id}-${b.id}`, a: m.pos, b: b.pos });
    }
    return out;
  }, [input]);
  const polluted = state.ponds.some((p) => p.overflow);
  return (
    <Canvas camera={{ position: [30, 26, 34], fov: 36 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Atmosphere hour={state.hour} field={field} rain={state.rain} />
      <Celestial hour={state.hour} field={field} rain={state.rain} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[260, 64]} />
        <meshStandardMaterial color={field ? '#d6c39c' : '#3f3a30'} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[30, 72]} />
        <meshStandardMaterial color={field ? '#e0cfa8' : '#5a5040'} roughness={1} />
      </mesh>

      {routes.map((r) => (
        <Road key={r.key} a={r.a} b={r.b} field={field} />
      ))}
      <Wadi rain={state.rain} polluted={polluted} reduced={reduced} />

      {/* drinking-water well with its 100 m safety ring */}
      <group position={[WELL[0], 0, WELL[1]]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.5, 0.55, 0.6, 16]} />
          <meshStandardMaterial color="#cfc6b4" />
        </mesh>
        <mesh position={[0, 0.61, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 16]} />
          <meshStandardMaterial color="#1b4d7e" emissive="#1b4d7e" emissiveIntensity={0.7} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[2.6, 2.75, 64]} />
          <meshBasicMaterial color={C.water} transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <Badge show={badges} position={[0, 1.6, 0]} tone="water" label="Drinking well" value="safe zone" />
      </group>

      <Trees groves={input.groves} />
      {input.groves.map((g) => {
        const s = state.groves.find((x) => x.id === g.id)!;
        return <GrovePatch key={g.id} grove={g} share={s.share} allowed={s.allowed} reason={s.reason} receiving={s.receiving} todayM3={s.todayM3} reduced={reduced} badges={badges} />;
      })}
      {input.mills.map((m) => {
        const p = state.ponds.find((x) => x.id === m.id)!;
        return <MillModel key={m.id} mill={m} share={p.share} overflow={p.overflow} grignonT={grignonStock[m.id] ?? m.grignonT} reduced={reduced} badges={badges} />;
      })}
      {input.buyers.map((b) => (
        <BuyerModel key={b.id} buyer={b} served={state.buyersServed.includes(b.id)} reduced={reduced} badges={badges} />
      ))}
      {state.trucks.map((t) => (
        <Truck key={t.key} t={t} reduced={reduced} />
      ))}

      <Rain intensity={state.rain} reduced={reduced} />
      <Rig pose={pose} interactive={interactive} reduced={reduced} />
    </Canvas>
  );
}
