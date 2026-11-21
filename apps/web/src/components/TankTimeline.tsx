import { useMemo, useRef } from 'react';
import { localHour, toMs, type Plan, type PlanInput } from '@sonae/shared';
import { clock, dayLabel } from '../lib/format';

const W = 960;
const X0 = 64;
const X1 = 944;
const PUMP = { y: 22, h: 26 };
const TANK = { y: 70, h: 128 };
const TURNS = { y: 214, h: 22 };
const AXIS_Y = 258;

interface Props {
  plan: Plan;
  input: PlanInput;
  cursor: number;
  onCursor: (i: number) => void;
}

/** The 48-hour picture: pump hours by energy, the tank curve, the turns and the STEG cut. */
export function TankTimeline({ plan, input, cursor, onCursor }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const H = plan.pump.length;
  const slotW = (X1 - X0) / H;
  const cap = input.gda.tank.capacityM3;
  const startMs = toMs(plan.pump[0]!.time);
  const x = (i: number) => X0 + i * slotW;
  const xMs = (ms: number) => X0 + ((ms - startMs) / 3_600_000) * slotW;
  const yLevel = (m3: number) => TANK.y + TANK.h - (Math.max(0, Math.min(cap, m3)) / cap) * TANK.h;

  const cutBands = useMemo(() => {
    const bands: Array<{ from: number; to: number }> = [];
    plan.pump.forEach((s, i) => {
      const inCut = input.outages.some((o) => toMs(o.start) < toMs(s.time) + 3_600_000 && toMs(o.end) > toMs(s.time));
      if (!inCut) return;
      const last = bands[bands.length - 1];
      if (last && last.to === i) last.to = i + 1;
      else bands.push({ from: i, to: i + 1 });
    });
    return bands;
  }, [plan, input.outages]);

  const areaPath = useMemo(() => {
    const pts = plan.tank.map((t, i) => `${x(i).toFixed(1)},${yLevel(t.levelM3).toFixed(1)}`);
    return {
      line: `M${pts.join('L')}`,
      area: `M${x(0)},${TANK.y + TANK.h}L${pts.join('L')}L${x(plan.tank.length - 1)},${TANK.y + TANK.h}Z`,
    };
  }, [plan, cap]);

  const ticks = plan.pump
    .map((s, i) => ({ i, h: localHour(s.time) }))
    .filter((t) => t.h % 6 === 0);
  const midnights = plan.pump.map((s, i) => ({ i, s })).filter(({ s }) => localHour(s.time) === 0);

  const levelAt = (c: number) => {
    const i = Math.floor(c);
    const a = plan.tank[Math.min(i, plan.tank.length - 1)]!.levelM3;
    const b = plan.tank[Math.min(i + 1, plan.tank.length - 1)]!.levelM3;
    return a + (b - a) * (c - i);
  };

  const fromPointer = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    onCursor(Math.max(0, Math.min(H, (p.x - X0) / slotW)));
  };

  const cutLabel = cutBands[0]
    ? `STEG cut ${clock(plan.pump[cutBands[0].from]!.time)} to ${clock(toMs(plan.pump[cutBands[0].to - 1]!.time) + 3_600_000)}`
    : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} 296`}
      className="w-full h-auto touch-none select-none"
      role="img"
      aria-label={`48-hour plan: pump hours by energy source, tank level and irrigation turns${cutLabel ? `, ${cutLabel}` : ''}`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) fromPointer(e.clientX);
      }}
    >
      <defs>
        <linearGradient id="tankFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--water)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--water)" stopOpacity="0.08" />
        </linearGradient>
        <pattern id="cutHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--cut)" fillOpacity="0.07" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--cut)" strokeOpacity="0.18" strokeWidth="3" />
        </pattern>
      </defs>

      {/* lane labels */}
      <g fontSize="12" fill="var(--ink-2)">
        <text x="0" y={PUMP.y + 17}>Pump</text>
        <text x="0" y={TANK.y + 12}>Tank</text>
        <text x="0" y={TURNS.y + 15}>Turns</text>
      </g>

      {/* the STEG cut */}
      {cutBands.map((b, k) => (
        <g key={k}>
          <rect x={x(b.from)} y={12} width={(b.to - b.from) * slotW} height={TURNS.y + TURNS.h - 4} fill="url(#cutHatch)" />
          <line x1={x(b.from)} x2={x(b.from)} y1={12} y2={TURNS.y + TURNS.h + 8} stroke="var(--cut)" strokeWidth="1.5" />
          {k === 0 && cutLabel && (
            <text x={x(b.from) + 6} y={10} fontSize="12" fontWeight="700" fill="var(--cut)">
              {cutLabel}
            </text>
          )}
        </g>
      ))}

      {/* pump hours */}
      <rect x={X0} y={PUMP.y + PUMP.h / 2 - 0.5} width={X1 - X0} height={1} fill="var(--line)" />
      {plan.pump.map((s, i) =>
        s.on ? (
          <rect
            key={i}
            x={x(i) + 1}
            y={PUMP.y}
            width={slotW - 2}
            height={PUMP.h}
            rx={3}
            fill={s.source === 'solar' ? 'var(--solar)' : s.source === 'diesel' ? 'var(--diesel)' : 'var(--grid)'}
          >
            <title>{`${clock(s.time)}: ${s.reason}`}</title>
          </rect>
        ) : null,
      )}

      {/* tank */}
      <line x1={X0} x2={X1} y1={yLevel(cap)} y2={yLevel(cap)} stroke="var(--ink-3)" strokeDasharray="3 4" />
      <text x={X1} y={yLevel(cap) - 5} textAnchor="end" fontSize="11" fill="var(--ink-2)">
        {cap} m³ full
      </text>
      <line
        x1={X0}
        x2={X1}
        y1={yLevel(input.gda.tank.minReserveM3)}
        y2={yLevel(input.gda.tank.minReserveM3)}
        stroke="var(--ink-3)"
        strokeDasharray="2 5"
      />
      <text x={X1} y={yLevel(input.gda.tank.minReserveM3) - 5} textAnchor="end" fontSize="11" fill="var(--ink-2)">
        reserve
      </text>
      <path d={areaPath.area} fill="url(#tankFill)" />
      <path d={areaPath.line} fill="none" stroke="var(--water)" strokeWidth="2.2" strokeLinejoin="round" />

      {/* turns */}
      {plan.turns.map((t, k) => {
        const x1 = xMs(toMs(t.start));
        const x2 = xMs(toMs(t.end));
        if (x2 < X0 || x1 > X1) return null;
        const farmer = input.farmers.find((f) => f.id === t.farmerId)?.name ?? '';
        return (
          <rect
            key={k}
            x={Math.max(X0, x1) + 0.5}
            y={TURNS.y}
            width={Math.max(1.5, Math.min(X1, x2) - Math.max(X0, x1) - 1)}
            height={TURNS.h}
            rx={3}
            fill="var(--ok)"
            fillOpacity={k % 2 === 0 ? 0.9 : 0.6}
          >
            <title>{`${clock(t.start)} to ${clock(t.end)}: ${farmer}, ${t.volumeM3} m³`}</title>
          </rect>
        );
      })}

      {/* time axis */}
      <line x1={X0} x2={X1} y1={AXIS_Y - 12} y2={AXIS_Y - 12} stroke="var(--line)" />
      {ticks.map((t) => (
        <g key={t.i}>
          <line x1={x(t.i)} x2={x(t.i)} y1={AXIS_Y - 15} y2={AXIS_Y - 9} stroke="var(--ink-3)" />
          <text x={x(t.i)} y={AXIS_Y + 4} textAnchor="middle" fontSize="11" fill="var(--ink-2)" className="num">
            {String(t.h).padStart(2, '0')}:00
          </text>
        </g>
      ))}
      {midnights.map(({ i, s }) => (
        <text key={i} x={x(i) + 4} y={AXIS_Y + 26} fontSize="12.5" fontWeight="700" fill="var(--ink)">
          {dayLabel(s.time, input.now)}
        </text>
      ))}
      <text x={X0} y={AXIS_Y + 26} fontSize="12.5" fontWeight="700" fill="var(--ink)">
        Now
      </text>

      {/* scrub cursor */}
      <g style={{ pointerEvents: 'none' }}>
        <line x1={x(cursor)} x2={x(cursor)} y1={14} y2={TURNS.y + TURNS.h + 6} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={x(cursor)} cy={yLevel(levelAt(cursor))} r={6} fill="var(--surface)" stroke="var(--water)" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function levelAtCursor(plan: Plan, c: number): number {
  const i = Math.floor(c);
  const a = plan.tank[Math.min(i, plan.tank.length - 1)]!.levelM3;
  const b = plan.tank[Math.min(i + 1, plan.tank.length - 1)]!.levelM3;
  return a + (b - a) * (c - i);
}
