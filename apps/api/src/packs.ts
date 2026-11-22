/**
 * Sonae packs, priced per olive season (November to February) in Tunisian dinars.
 * Mills carry the waste problem and pay most; farmers pay a small fee per hectare.
 * Prices are our launch proposal, consistent with the business plan (about 0.5 TND per m³ of margine).
 */
export interface Pack {
  id: string;
  role: 'mill' | 'farmer';
  name: string;
  /** Fixed price per season (TND). */
  priceTND: number;
  /** Extra price per unit above the included amount, or per hectare for farmers. */
  perUnitTND: number;
  unit: string;
  /** Margine included (m³) for mills, or area included (ha) for farmers. */
  included: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

export const PACKS: Pack[] = [
  {
    id: 'mill-essentiel',
    role: 'mill',
    name: 'Essentiel',
    priceTND: 390,
    perUnitTND: 0.6,
    unit: 'm³ above 600',
    included: 600,
    tagline: 'Small maâsra, one tanker',
    features: ['Daily spreading plan with rain checks', 'Up to 600 m³ of margine traced', 'Derja SMS to farmers and driver (300 a season)', 'Yui passport for every load'],
  },
  {
    id: 'mill-pro',
    role: 'mill',
    name: 'Pro',
    priceTND: 950,
    perUnitTND: 0.45,
    unit: 'm³ above 2,000',
    included: 2000,
    tagline: 'Most mills in the Sahel and Sfax',
    features: ['Everything in Essentiel', 'Up to 2,000 m³ traced, several tankers', 'Zero-Spill oil certificates (QR on the bottle)', 'Grignon market: buyers matched for you', 'AI season plan and lab-report reading'],
    highlight: true,
  },
  {
    id: 'mill-cooperative',
    role: 'mill',
    name: 'Coopérative',
    priceTND: 2400,
    perUnitTND: 0.35,
    unit: 'm³ above 6,000',
    included: 6000,
    tagline: 'Large mills and groups of mills',
    features: ['Everything in Pro', 'Up to 6,000 m³, several ponds and sites', 'Tanker GPS and flow-meter oracle', 'Inspector dashboard and exports'],
  },
  {
    id: 'farmer-free',
    role: 'farmer',
    name: 'Voisin',
    priceTND: 0,
    perUnitTND: 0,
    unit: 'ha',
    included: 0,
    tagline: 'Receive margine, nothing to pay',
    features: ['SMS before each delivery', 'Grove check with your local forecast', 'Confirm deliveries on the passport'],
  },
  {
    id: 'farmer-grove',
    role: 'farmer',
    name: 'Grove',
    priceTND: 0,
    perUnitTND: 35,
    unit: 'per hectare',
    included: 0,
    tagline: 'Plan the dose for your trees',
    features: ['Everything in Voisin', 'Dose planned from your lab results', 'AI season plan for your land', 'Priority deliveries on dry days'],
    highlight: true,
  },
  {
    id: 'farmer-grove-plus',
    role: 'farmer',
    name: 'Grove+',
    priceTND: 0,
    perUnitTND: 55,
    unit: 'per hectare',
    included: 0,
    tagline: 'With a soil test every season',
    features: ['Everything in Grove', 'One soil analysis per season (partner lab)', 'Potassium and water balance per plot'],
  },
];

/** What a season costs on a pack, for a mill's margine volume or a farm's area. */
export function packCost(pack: Pack, amount: number): number {
  if (pack.role === 'mill') return Math.round(pack.priceTND + Math.max(0, amount - pack.included) * pack.perUnitTND);
  return Math.round(pack.priceTND + amount * pack.perUnitTND);
}

/** The cheapest suitable pack for a mill's volume. */
export function bestMillPack(margineM3: number): Pack {
  const mills = PACKS.filter((p) => p.role === 'mill');
  return mills.reduce((best, p) => (packCost(p, margineM3) < packCost(best, margineM3) ? p : best), mills[0]!);
}
