import { useEffect, useState } from 'react';
import { TelemetrySchema, toMs, toTunisISO, localHour, HOUR, type EnergySource, type NodeMode, type Plan, type PlanInput, type Telemetry } from '@sonae/shared';
import { levelAtCursor } from '../components/TankTimeline';

export interface TwinState {
  timeIso: string;
  hour: number;
  levelM3: number;
  levelShare: number;
  pumpOn: boolean;
  source?: EnergySource;
  gridOn: boolean;
  valveOpen: boolean;
  flowM3h: number;
  solarKW: number;
  mode: NodeMode;
  farmer?: string;
}

/** What the node would report at a point of the plan (the simulated twin). */
export function twinAt(plan: Plan, input: PlanInput, cursor: number, forceCut: boolean): TwinState {
  const H = plan.pump.length;
  const i = Math.min(H - 1, Math.max(0, Math.floor(cursor)));
  const slot = plan.pump[i]!;
  const ms = toMs(plan.pump[0]!.time) + cursor * HOUR;
  const announcedCut = input.outages.some((o) => toMs(o.start) <= ms && toMs(o.end) > ms);
  const gridOn = !announcedCut && !forceCut;
  const pumpOn = slot.on && !(slot.source === 'grid' && !gridOn);
  const turn = plan.turns.find((t) => toMs(t.start) <= ms && toMs(t.end) > ms);
  const fc = input.forecast.find((f) => Math.abs(toMs(f.time) - (toMs(plan.pump[0]!.time) + i * HOUR)) < 1000);
  const solarKW = input.gda.solar && fc ? input.gda.solar.kWp * (fc.radiationWm2 / 1000) * 0.8 : 0;
  const levelM3 = levelAtCursor(plan, cursor);
  const mode: NodeMode = !gridOn && !pumpOn ? 'GRID_DOWN' : pumpOn ? 'PUMPING' : turn ? 'IRRIGATING' : 'IDLE';
  return {
    timeIso: toTunisISO(ms),
    hour: localHour(ms) + (cursor % 1),
    levelM3,
    levelShare: levelM3 / input.gda.tank.capacityM3,
    pumpOn,
    source: pumpOn ? slot.source : undefined,
    gridOn,
    valveOpen: !!turn,
    flowM3h: turn ? input.gda.gravityFlowM3h : 0,
    solarKW,
    mode,
    farmer: turn ? input.farmers.find((f) => f.id === turn.farmerId)?.name : undefined,
  };
}

/** Map a real node message to the twin. */
export function twinFromTelemetry(t: Telemetry, capacityM3: number): TwinState {
  const ms = t.ts * 1000;
  return {
    timeIso: toTunisISO(ms),
    hour: localHour(ms) + new Date(ms).getUTCMinutes() / 60,
    levelM3: (t.levelPct / 100) * capacityM3,
    levelShare: t.levelPct / 100,
    pumpOn: t.pump,
    source: t.pump ? (t.solarW > 1 && !t.grid ? 'solar' : 'grid') : undefined,
    gridOn: t.grid,
    valveOpen: t.valve === 'open',
    flowM3h: (t.flowLpm * 60) / 1000,
    solarKW: t.solarW / 1000,
    mode: t.mode,
  };
}

const WS_URL = import.meta.env.VITE_MQTT_WS_URL as string | undefined;
const TOPIC = (import.meta.env.VITE_MQTT_TOPIC as string | undefined) ?? 'sonae/+/+/telemetry';

export type LiveStatus = 'off' | 'connecting' | 'waiting' | 'live' | 'error' | 'not-configured';

/** Live telemetry over MQTT/WebSocket (Wokwi or the real ESP32). Messages are validated before use. */
export function useLiveTelemetry(enabled: boolean): { status: LiveStatus; last: Telemetry | null; error: string | null } {
  const [status, setStatus] = useState<LiveStatus>('off');
  const [last, setLast] = useState<Telemetry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (!WS_URL) {
      setStatus('not-configured');
      return;
    }
    let client: { end: (force?: boolean) => void } | null = null;
    let cancelled = false;
    setStatus('connecting');
    import('mqtt')
      .then(({ default: mqtt }) => {
        if (cancelled) return;
        const c = mqtt.connect(WS_URL, { clientId: `sonae-web-${Math.random().toString(16).slice(2, 10)}`, reconnectPeriod: 4000, connectTimeout: 8000 });
        client = c;
        c.on('connect', () => {
          setStatus('waiting');
          c.subscribe(TOPIC);
        });
        c.on('message', (_topic: string, payload: Uint8Array) => {
          try {
            const parsed = TelemetrySchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
            if (parsed.success) {
              setLast(parsed.data as Telemetry);
              setStatus('live');
            }
          } catch {
            /* ignore malformed messages */
          }
        });
        c.on('error', (e: Error) => {
          setError(e.message);
          setStatus('error');
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'MQTT failed to load');
        setStatus('error');
      });
    return () => {
      cancelled = true;
      client?.end(true);
    };
  }, [enabled]);

  return { status, last, error };
}
