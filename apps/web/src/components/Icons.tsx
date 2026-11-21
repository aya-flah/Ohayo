import type { SVGProps } from 'react';

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

type P = SVGProps<SVGSVGElement>;

export const IconPlan = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <path d="M3 9h18M8 2.5v3M16 2.5v3M7.5 14h3M7.5 17.5h6" />
  </svg>
);
export const IconTwin = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </svg>
);
export const IconYui = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </svg>
);
export const IconReplay = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4.5h4.5" />
    <path d="M12 8v4.5l3 1.8" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const IconSun = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
export const IconBolt = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />
  </svg>
);
export const IconDrop = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z" />
  </svg>
);
export const IconCut = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />
    <path d="M3 3l18 18" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 5v14M16 5v14" strokeWidth={2.6} />
  </svg>
);
export const IconMessage = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5h16v11H10l-5 4v-4H4z" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconLock = ({ open = false, ...p }: P & { open?: boolean }) => (
  <svg {...base} {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path
      d="M8 11V8a4 4 0 0 1 8 0v3"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '100% 100%',
        transform: open ? 'translateY(-2px) rotate(-28deg)' : 'none',
        transition: 'transform var(--motion-300) var(--ease-out)',
      }}
    />
  </svg>
);
export const IconWifiOff = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M14.5 10.3A10 10 0 0 1 19 12.5M2 9a15 15 0 0 1 4.3-2.7M10.5 5.1A15 15 0 0 1 22 9" />
    <circle cx="12" cy="20" r="0.6" fill="currentColor" />
  </svg>
);
