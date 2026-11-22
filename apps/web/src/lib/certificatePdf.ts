import QRCode from 'qrcode';

/**
 * Builds the Zero-Spill certificate as a real A4 landscape PDF file, in the browser, and downloads it.
 * Text, frames, figures and the seal are vector (sharp on any printer); the logo, olive sprigs and
 * watermark are small images drawn on a canvas so the kanji and curves look the same as on screen.
 */

export interface CertificatePdfData {
  id: number;
  mill: string;
  litres: number;
  deliveredM3: number;
  declaredM3: number;
  loads: number;
  issued: string;
  millWallet: string;
  batchRef: string;
  batchName?: string;
  contract: string;
  verifyUrl: string;
}

const nf = (n: number) => n.toLocaleString('en-US');
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function svgPng(svg: string, w: number, h: number): Promise<string> {
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/png');
}

const SPRIG = (flip: boolean, turn = false) => {
  const leaves = [
    [34, 124, -38],
    [52, 104, 18],
    [66, 92, -42],
    [84, 74, 14],
    [98, 60, -46],
    [116, 44, 10],
    [128, 32, -50],
  ]
    .map(([x, y, r], i) => `<ellipse cx="${x}" cy="${y}" rx="15" ry="5.2" transform="rotate(${r} ${x} ${y})" fill="${i % 2 ? '#8ea35a' : '#6b7f3a'}" opacity="0.85"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="320" height="320"><g transform="${turn ? 'rotate(180 80 80) ' : ''}${flip ? 'translate(160 0) scale(-1 1)' : ''}"><path d="M12 148 C 50 110, 82 72, 150 14" stroke="#6b7f3a" stroke-width="2.2" stroke-linecap="round" fill="none"/>${leaves}<circle cx="74" cy="88" r="5" fill="#2f3b18"/><circle cx="108" cy="56" r="4.4" fill="#2f3b18"/></g></svg>`;
};

const KANJI_FONT = '"Zen Kaku Gothic New", "Shippori Mincho B1", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';

function logoPng(): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 240;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 240, 240);
  grad.addColorStop(0, '#2f8fd6');
  grad.addColorStop(1, '#1b4d7e');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(0, 0, 240, 240, 66);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 140px ${KANJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('備', 120, 128);
  return c.toDataURL('image/png');
}

function watermarkPng(): string {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 480;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(107, 127, 58, 0.06)';
  g.font = `800 416px ${KANJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('備', 240, 256);
  return c.toDataURL('image/png');
}

/** Creates the PDF and hands it to the browser as a download (or the phone's share sheet). */
export async function downloadCertificatePdf(d: CertificatePdfData): Promise<void> {
  const [{ jsPDF, GState }] = await Promise.all([import('jspdf'), document.fonts?.ready]);
  const [sprigL, sprigR, sprigBL, sprigBR, qr] = await Promise.all([
    svgPng(SPRIG(true), 220, 220),
    svgPng(SPRIG(false), 220, 220),
    svgPng(SPRIG(false, true), 220, 220),
    svgPng(SPRIG(true, true), 220, 220),
    QRCode.toDataURL(d.verifyUrl, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#1f2a12', light: '#fffdf6' } }),
  ]);
  const logo = logoPng();
  const mark = watermarkPng();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const W = 297;
  const H = 210;
  const cx = W / 2;

  // Paper and frames
  doc.setFillColor(251, 246, 232);
  doc.rect(0, 0, W, H, 'F');
  doc.addImage(mark, 'PNG', cx - 75, 30, 150, 150, undefined, 'FAST');
  doc.setDrawColor(107, 127, 58);
  doc.setLineWidth(0.9);
  doc.roundedRect(5, 5, W - 10, H - 10, 1.6, 1.6);
  doc.setDrawColor(183, 162, 106);
  doc.setLineWidth(0.3);
  doc.roundedRect(7.6, 7.6, W - 15.2, H - 15.2, 1, 1);
  doc.addImage(sprigL, 'PNG', 8, 8, 38, 38, undefined, 'FAST');
  doc.addImage(sprigR, 'PNG', W - 46, 8, 38, 38, undefined, 'FAST');
  doc.setGState(new GState({ opacity: 0.5 }));
  doc.addImage(sprigBL, 'PNG', 8, H - 38, 30, 30, undefined, 'FAST');
  doc.addImage(sprigBR, 'PNG', W - 38, H - 38, 30, 30, undefined, 'FAST');
  doc.setGState(new GState({ opacity: 1 }));

  // Brand
  doc.addImage(logo, 'PNG', cx - 26, 15, 12, 12, undefined, 'FAST');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(28, 42, 58);
  doc.text('Sonae', cx - 11.5, 21);
  const sw = doc.getTextWidth('Sonae ');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(91, 107, 123);
  doc.text('Zitoun', cx - 11.5 + sw, 21);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(122, 138, 90);
  doc.text('OLIVE WASTE, TRACED', cx - 11.5, 25.5, { charSpace: 0.6 });

  // Title
  doc.setFontSize(9);
  doc.setTextColor(138, 106, 43);
  doc.text(`CERTIFICATE  ·  N° ${String(d.id).padStart(4, '0')}`, cx, 36, { align: 'center', charSpace: 1.2 });
  doc.setFont('times', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(47, 59, 24);
  doc.text('Zero-Spill Certificate', cx, 51, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(107, 127, 58);
  doc.text('Clean olive oil, proven on the blockchain', cx, 58, { align: 'center' });

  // Mill
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(90, 90, 72);
  doc.text('This certifies that the olive mill', cx, 70, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(28, 42, 58);
  doc.text(d.mill, cx, 82, { align: 'center' });
  doc.setDrawColor(183, 162, 106);
  doc.setLineWidth(0.5);
  doc.line(cx - 55, 86, cx + 55, 86);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(61, 70, 48);
  const sentence = `produced ${nf(d.litres)} litres of olive oil${d.batchName ? ` (batch ${d.batchName})` : ''} while sending its margine only to approved olive groves, under the legal limit of each grove, with every load confirmed on arrival and no load lost.`;
  doc.text(doc.splitTextToSize(sentence, 200), cx, 95, { align: 'center', lineHeightFactor: 1.45 });

  // Figures
  const bx = cx - 103;
  const by = 113;
  const bw = 206;
  const bh = 22;
  doc.setFillColor(255, 253, 246);
  doc.setDrawColor(217, 203, 160);
  doc.setLineWidth(0.3);
  doc.roundedRect(bx, by, bw, bh, 3, 3, 'FD');
  const figs: Array<[string, string, boolean]> = [
    [`${nf(d.deliveredM3)} m³`, 'margine confirmed on groves', false],
    [`${d.loads}`, 'traced tanker loads', false],
    ['0', 'lost loads', true],
    [`${nf(d.declaredM3)} m³`, 'margine declared', false],
  ];
  figs.forEach(([v, l, green], i) => {
    const x = bx + (bw / 4) * i + bw / 8;
    if (i) doc.line(bx + (bw / 4) * i, by + 3, bx + (bw / 4) * i, by + bh - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    if (green) doc.setTextColor(46, 125, 79);
    else doc.setTextColor(28, 42, 58);
    doc.text(v, x, by + 10, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(122, 116, 88);
    doc.text(l, x, by + 16.5, { align: 'center' });
  });

  // Seal
  const sx = 34;
  const sy = 172;
  doc.setFillColor(233, 244, 226);
  doc.setDrawColor(46, 125, 79);
  doc.setLineWidth(0.9);
  doc.circle(sx, sy, 13, 'FD');
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.circle(sx, sy, 11.2);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(1.1);
  doc.lines(
    [
      [2.6, 2.6],
      [5.8, -6.2],
    ],
    sx - 4.4,
    sy - 3.6,
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(46, 125, 79);
  doc.setFontSize(6.6);
  doc.text('VERIFIED', sx, sy + 4.3, { align: 'center', charSpace: 0.4 });
  doc.setFontSize(5.4);
  doc.text('ON CHAIN', sx, sy + 7.3, { align: 'center', charSpace: 0.3 });

  // Details
  const rows: Array<[string, string]> = [
    ['Issued', d.issued],
    ['Mill wallet', short(d.millWallet)],
    ['Batch fingerprint', short(d.batchRef)],
    ['Ledger', `ZitounLedger ${short(d.contract)} · Ethereum Sepolia`],
  ];
  rows.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(61, 70, 48);
    doc.text(k, 52, 164 + i * 4.6);
    doc.setFont('courier', 'normal');
    doc.setTextColor(90, 90, 72);
    doc.text(v, 80, 164 + i * 4.6);
  });

  // Verify QR
  doc.setFillColor(255, 253, 246);
  doc.setDrawColor(217, 203, 160);
  doc.roundedRect(W - 50, 150, 32, 32, 1.6, 1.6, 'FD');
  doc.addImage(qr, 'PNG', W - 48.5, 151.5, 29, 29, undefined, 'FAST');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(47, 59, 24);
  doc.text('Scan to verify', W - 53, 166, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 72);
  doc.text('No account needed.', W - 53, 170.5, { align: 'right' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.8);
  doc.text(d.verifyUrl.replace(/^https?:\/\//, ''), W - 53, 175, { align: 'right' });

  doc.setProperties({ title: `Zero-Spill certificate #${d.id} · ${d.mill}`, subject: 'Sonae Zitoun Zero-Spill certificate', creator: 'Sonae Zitoun' });

  // Hand the file over: a normal download, or the share sheet where downloads don't work.
  const name = `Sonae-ZeroSpill-Certificate-${d.id}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], name, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch {
      /* user closed the share sheet: fall back to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
