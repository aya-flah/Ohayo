import { create } from 'zustand';

/**
 * "How it works": the olive waste, step by step, in 3D.
 * Steps 1-5 follow the margine to the soil; 6-8 follow the grignon (fitoura) to the well's engine;
 * 9 shows the whole circle. The camera flies to each step's station.
 */
export type Track = 'both' | 'margine' | 'grignon';

export interface ProcessStep {
  title: string;
  body: string;
  facts: string[];
  note?: string;
  track: Track;
  /** Camera: target, distance, polar angle, azimuth. */
  cam: { target: [number, number, number]; r: number; polar: number; az: number };
}

export const STEPS: ProcessStep[] = [
  {
    title: 'The maâsra presses the olives',
    body: 'Olives are crushed and spun in the decanter. Three things come out: olive oil, margine (the dark water) and grignon, the paste of skins and pits Tunisians call fitoura.',
    facts: ['About 0.5 to 1 m³ of margine per tonne of olives', 'Grignon: roughly 40% of the olives’ weight'],
    track: 'both',
    cam: { target: [0, 1.6, -8], r: 15, polar: 1.12, az: 0.35 },
  },
  {
    title: 'Margine waits in a lined pond, and is tested',
    body: 'The margine settles in the mill’s pond. A sample is tested for acidity and potassium; the reading is hashed onto the Yui passport so it can’t be changed later.',
    facts: ['Typical: pH 4.5 to 5.5, rich in potassium', 'Sonae watches the pond level every day'],
    track: 'margine',
    cam: { target: [-7, 0.8, -6], r: 13, polar: 1.05, az: -0.5 },
  },
  {
    title: 'On a safe day, a tanker loads 15 m³',
    body: 'Sonae only sends the tanker on a dry day, with no rain tomorrow, to the nearest approved grove: not near a well, not near the wadi, not on a slope.',
    facts: ['Fullest pond served first', 'Every load recorded: mill, grove, m³'],
    track: 'margine',
    cam: { target: [-5, 0.8, 0], r: 20, polar: 0.95, az: -0.3 },
  },
  {
    title: 'A thin film between the olive rows',
    body: 'The spray bar lays the margine as a thin layer on the soil between the trees, never as a puddle. The farmer, or the tanker’s meter, confirms the delivery on the passport.',
    facts: ['At most 10 m³ per hectare per day', 'At most 50 m³ per hectare per season'],
    track: 'margine',
    cam: { target: [0, 0.6, 7], r: 16, polar: 0.92, az: 0.15 },
  },
  {
    title: 'The soil does the rest',
    body: 'In the top layer of soil, microbes break down the bitter part over a few weeks. Water and potassium stay in the root zone and feed the olive trees. Nothing reaches the well or the wadi.',
    facts: ['Potassium for the trees: fertiliser the farmer doesn’t buy', 'No spreading 2 days before rain or on wet soil'],
    note: 'Margine never goes into water: not into wells, wadis or irrigation water. It feeds the soil only.',
    track: 'margine',
    cam: { target: [0, -0.4, 10.4], r: 9, polar: 1.32, az: 0.0 },
  },
  {
    title: 'Fitoura dries in the sun',
    body: 'Fresh grignon is wet and heavy. Spread on a drying yard and turned, it dries in the Tunisian sun until it burns well.',
    facts: ['From about 50% water down to about 10%', 'Dry grignon burns like firewood'],
    track: 'grignon',
    cam: { target: [8, 0.5, -6], r: 13, polar: 1.0, az: 0.6 },
  },
  {
    title: 'Pellets, then gas',
    body: 'Dry fitoura is pressed into pellets. In the gasifier the pellets are heated with little air: instead of burning, they give off a burnable gas.',
    facts: ['2.5 kg of dry grignon ≈ the heat of 1 kg of diesel', 'The gas is cooled and filtered before the engine'],
    note: 'Olive-pomace gas carries tar: the filter needs regular cleaning.',
    track: 'grignon',
    cam: { target: [10, 1.5, 1], r: 15, polar: 1.05, az: 0.75 },
  },
  {
    title: 'The gas runs the well’s engine',
    body: 'The pump’s diesel engine runs on the gas plus a little diesel ("dual fuel"). It lifts well water, which drips onto the same olive grove.',
    facts: ['About 60 to 70% less diesel', 'Drip irrigation from the well to the grove'],
    note: 'A gasifier costs several thousand dinars: a step for later. Solar stays the cheapest way to pump.',
    track: 'grignon',
    cam: { target: [4, 0.8, 6], r: 15, polar: 1.0, az: 0.55 },
  },
  {
    title: 'The full circle',
    body: 'The oil is sold. The margine feeds the soil. The fitoura pumps the water. Next winter the same trees bring the olives back to the maâsra, and every step is on the passport.',
    facts: ['No waste in the wadis', 'Less fertiliser, less diesel'],
    track: 'both',
    cam: { target: [1, 0.5, 0], r: 34, polar: 0.82, az: 0.4 },
  },
];

interface ProcessStore {
  step: number;
  playing: boolean;
  setStep: (s: number) => void;
  setPlaying: (p: boolean) => void;
}

export const useProcess = create<ProcessStore>((set) => ({
  step: 0,
  playing: false,
  setStep: (step) => set({ step: Math.max(0, Math.min(STEPS.length - 1, step)) }),
  setPlaying: (playing) => set({ playing }),
}));
