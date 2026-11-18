// news-image-20261118 — one 1024x1024 poster summing up 18 November 2026.
// Pure TypeScript, Node standard library only. Builds the PNG from raw RGB
// scanlines (zlib deflate + hand-rolled PNG chunks), a 5x7 bitmap font, and
// simple shape drawing. No canvas, no dependencies, no copied starter code.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const px = Buffer.alloc(W * H * 3);

type RGB = [number, number, number];
function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function setPixel(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 3;
  px[o] = c[0];
  px[o + 1] = c[1];
  px[o + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const o = (yy * W + xx) * 3;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const hw = Math.floor(Math.sqrt(rr * rr - dy * dy));
    for (let dx = -hw; dx <= hw; dx++) setPixel(cx + dx, cy + dy, c);
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const s = steps === 0 ? 0 : i / steps;
    fillCircle(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, t / 2, c);
  }
}
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const pts: [number, number][] = [[ax, ay], [bx, by], [cx, cy]].sort((a, b) => a[1] - b[1]);
  const [p0, p1, p2] = pts;
  const lerp = (y: number, a: [number, number], b: [number, number]): number =>
    b[1] === a[1] ? a[0] : a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
  for (let y = Math.ceil(p0[1]); y <= Math.floor(p2[1]); y++) {
    const xa = lerp(y, p0, p2);
    const xb = y < p1[1] ? lerp(y, p0, p1) : lerp(y, p1, p2);
    fillRect(Math.min(xa, xb), y, Math.abs(xb - xa) + 1, 1, c);
  }
}
// Top half of a circle (dome): rows above the centre line.
function dome(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= 0; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    fillRect(cx - hw, cy + dy, hw * 2 + 1, 1, c);
  }
}
function darken(c: RGB, f: number): RGB {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}
function lighten(c: RGB, f: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * f),
    Math.round(c[1] + (255 - c[1]) * f),
    Math.round(c[2] + (255 - c[2]) * f),
  ];
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function toPNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 cells, '#' = ink.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '...#.', '..#..', '.#...', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '•': ['.....', '.....', '.###.', '.###.', '.###.', '.....', '.....'],
};
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: RGB, align: 'left' | 'center' = 'left'): void {
  const w = textWidth(s, scale);
  let cx = x;
  if (align === 'center') cx = x - Math.floor(w / 2);
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]] ?? FONT[' '];
    const gx = cx + i * 6 * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '#') fillRect(gx + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

// ---------------------------------------------------------------- palette
const NAVY = hex('#0A1128');
const PANEL = hex('#141D38');
const INK = hex('#F8FAFC');
const CAPTION = hex('#CBD5E1');
const DIM = hex('#94A3B8');
const GOLD = hex('#FFC53D');
const WHITE: RGB = [255, 255, 255];

// ---------------------------------------------------------------- icons
// Each icon draws in white, centred on (cx, cy), inside ~90x90.
function iconBurst(cx: number, cy: number): void {
  fillCircle(cx, cy, 9, WHITE);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    thickLine(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 5, WHITE);
  }
  fillCircle(cx - 22, cy + 32, 4, WHITE);
  fillCircle(cx, cy + 36, 4, WHITE);
  fillCircle(cx + 22, cy + 32, 4, WHITE);
}
function iconBridge(cx: number, cy: number): void {
  const deckY = cy - 14;
  thickLine(cx - 44, deckY, cx - 10, deckY, 5, WHITE); // left deck
  thickLine(cx + 10, deckY, cx + 44, deckY, 5, WHITE); // right deck, gap in the middle
  thickLine(cx, deckY + 8, cx, deckY + 24, 4, WHITE); // down arrow shaft
  fillTriangle(cx, deckY + 36, cx - 8, deckY + 22, cx + 8, deckY + 22, WHITE); // arrow head
  thickLine(cx - 18, deckY + 42, cx - 4, deckY + 42, 3, WHITE); // splash
  thickLine(cx + 6, deckY + 42, cx + 18, deckY + 42, 3, WHITE);
}
function iconSummit(cx: number, cy: number): void {
  for (const dx of [-28, 0, 28]) {
    const hx = cx + dx;
    const hy = cy - 16 + (dx === 0 ? -5 : 0);
    fillCircle(hx, hy, 9, WHITE); // head
    fillTriangle(hx, hy + 10, hx - 12, cy + 36, hx + 12, cy + 36, WHITE); // body
  }
}
function iconDome(cx: number, cy: number): void {
  thickLine(cx, cy - 20, cx, cy - 34, 3, WHITE); // flag pole
  fillTriangle(cx, cy - 34, cx + 12, cy - 30, cx, cy - 26, WHITE); // flag
  dome(cx, cy + 6, 26, WHITE); // dome
  fillRect(cx - 34, cy + 6, 68, 12, WHITE); // entablature
  for (const dx of [-22, 0, 22]) thickLine(cx + dx, cy + 18, cx + dx, cy + 34, 4, WHITE); // columns
  fillRect(cx - 38, cy + 34, 76, 6, WHITE); // base
}
function iconVirus(cx: number, cy: number): void {
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5;
    thickLine(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, cx + Math.cos(a) * 27, cy + Math.sin(a) * 27, 4, WHITE);
  }
  fillCircle(cx, cy, 13, WHITE);
  fillCircle(cx - 5, cy - 3, 3, NAVY);
  fillCircle(cx + 5, cy + 3, 3, NAVY);
  fillCircle(cx + 4, cy - 6, 2, NAVY);
}
function iconFilament(cx: number, cy: number): void {
  let px0 = cx - 40;
  let py0 = cy + Math.round(14 * Math.sin(0));
  for (let t = 2; t <= 80; t += 2) {
    const x = cx - 40 + t;
    const y = cy + Math.round(14 * Math.sin(t / 13));
    thickLine(px0, py0, x, y, 6, WHITE);
    px0 = x;
    py0 = y;
  }
  fillCircle(cx - 40, cy, 6, WHITE);
  fillCircle(cx + 40, cy + Math.round(14 * Math.sin(80 / 13)), 5, WHITE);
}

// ---------------------------------------------------------------- layout
interface Story {
  color: string;
  icon: (cx: number, cy: number) => void;
  head: [string, string];
  cap: [string, string];
  stat: string;
}
const STORIES: Story[] = [
  { color: '#FF5A3C', icon: iconBurst, head: ['GULF', 'STRIKES'], cap: ['US HITS QESHM', 'IRAN HITS BAHRAIN'], stat: 'KUWAIT TOO' },
  { color: '#7DD3FC', icon: iconBridge, head: ['CRIMEA BRIDGE', 'FALLS'], cap: ['UKRAINE STRIKES', 'KERCH BRIDGE'], stat: 'SPAN DOWN' },
  { color: '#FFC53D', icon: iconSummit, head: ['THREE-LEADER', 'SUMMIT'], cap: ['XI, PUTIN, TRUMP', 'MEET AT APEC'], stat: 'SHENZHEN' },
  { color: '#3B82F6', icon: iconDome, head: ['DEMOCRATS', 'TAKE SENATE'], cap: ['PELTOLA WINS', 'ALASKA SEAT'], stat: 'DEMS 56-44' },
  { color: '#EC4899', icon: iconVirus, head: ['MEASLES', 'RETURNS'], cap: ['US LOSES STATUS', 'AFTER 26 YEARS'], stat: '5,400 CASES' },
  { color: '#22C55E', icon: iconFilament, head: ['EBOLA', 'SURGES'], cap: ['11,000 CASES IN', 'DR CONGO'], stat: 'STILL RISING' },
];

function drawPanel(px0: number, py0: number, s: Story): void {
  const PW = 482;
  const PH = 236;
  const col = hex(s.color);
  fillRect(px0, py0, PW, PH, PANEL);
  fillRect(px0, py0, PW, 10, col); // top bar
  fillRect(px0, py0 + PH - 6, PW, 6, col); // bottom bar
  fillRect(px0, py0 + 10, 118, PH - 10, darken(col, 0.45)); // icon column
  s.icon(px0 + 59, py0 + 128); // icon, centred in the column
  const tx = px0 + 134;
  drawText(tx, py0 + 36, s.head[0], 4, INK);
  drawText(tx, py0 + 68, s.head[1], 4, INK);
  fillRect(tx, py0 + 106, 64, 5, col); // underline
  drawText(tx, py0 + 124, s.cap[0], 3, CAPTION);
  drawText(tx, py0 + 147, s.cap[1], 3, CAPTION);
  drawText(tx, py0 + 186, s.stat, 4, lighten(col, 0.25)); // key stat, lightened for contrast
}

function draw(): void {
  fillRect(0, 0, W, H, NAVY);
  // Header
  drawText(512, 36, '18 NOVEMBER 2026', 9, INK, 'center');
  fillRect(84, 118, 856, 6, GOLD);
  drawText(512, 136, 'THE WORLD IN ONE IMAGE', 5, GOLD, 'center');
  // Grid: 2 cols x 3 rows
  const xs = [24, 518];
  const ys = [196, 444, 692];
  for (let i = 0; i < 6; i++) {
    drawPanel(xs[i % 2], ys[Math.floor(i / 2)], STORIES[i]);
  }
  // Footer ticker: the stories that did not make the grid
  drawText(512, 946, 'ALSO: VOYAGER 1 REACHES ONE LIGHT-DAY - SIBERIA CRASH KILLS 19', 2, DIM, 'center');
  drawText(512, 968, 'QUAKES HIT PAPUA NEW GUINEA + ROMANIA - NVIDIA REPORTS $115.8B', 2, DIM, 'center');
}

draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), toPNG());
console.log('wrote', join(outDir, 'entry.png'));
