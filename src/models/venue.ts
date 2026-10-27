import * as THREE from 'three';
import type { Feature, Venue } from '../schema';
import { COLORS } from '../theme';
import { ball, cyl, glow, rand, rbox, std, type Built } from './parts';

/**
 * The room and everything in it, built from primitives.
 * Every furniture model is built in its own frame: width runs along local x,
 * the front faces +z. buildFeature then turns it to face away from the nearest wall.
 * Props stay inside the footprint the model gave (w by d), so nobody clips into them.
 */

// ---- little canvas textures --------------------------------------------------

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft white dot that fades to nothing. Used for light pools, dust and bulbs. */
function radialTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Top colour to bottom colour. With additive blending, black means "nothing here". */
export function gradientTexture(top: string, bottom: string): THREE.CanvasTexture {
  return canvasTexture(4, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Wood planks. One tile covers 2.4 m. */
function plankTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const rows = 12;
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      const light = 27 + rand(r * 3.1) * 9;
      ctx.fillStyle = `hsl(${212 + rand(r * 1.7) * 8}, 7%, ${light}%)`;
      ctx.fillRect(0, r * rowH, w, rowH);
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + rand(r * 40 + i) * 0.07})`;
        ctx.fillRect(rand(r * 91 + i * 7) * w, r * rowH + rand(r * 13 + i * 3) * rowH, 40 + rand(i + r) * 220, 1.4);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, r * rowH, w, 2);
      const joint = rand(r * 5.3) * w;
      ctx.fillRect(joint, r * rowH, 2, rowH);
    }
  });
}

/** Marquee for the big screen: the venue name twice, so the scroll wraps without a seam. */
function screenTexture(name: string): THREE.CanvasTexture {
  const texture = canvasTexture(1536, 496, (ctx, w, h) => {
    const half = w / 2;
    for (let k = 0; k < 2; k++) {
      const x0 = k * half;
      const g = ctx.createLinearGradient(x0, 0, x0 + half, h);
      g.addColorStop(0, '#0d1117');
      g.addColorStop(0.5, '#182231');
      g.addColorStop(1, '#0d1117');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, half, h);
      let size = 150;
      ctx.font = `600 ${size}px "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif`;
      while (ctx.measureText(name).width > half - 90 && size > 40) {
        size -= 8;
        ctx.font = `600 ${size}px "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif`;
      }
      ctx.fillStyle = '#eef2f7';
      ctx.fillText(name, x0 + 40, h / 2 + size * 0.34);
      ctx.fillStyle = '#6ea8fe';
      ctx.fillRect(x0 + 40, h / 2 + size * 0.34 + 28, 120, 6);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** Soft glow on the floor. Additive, so it only ever brightens. */
export function lightPool(w: number, d: number, color: number, opacity: number, y = 0.012): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: radialTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

// ---- room shell ---------------------------------------------------------------

export function buildFloor(venue: Venue): THREE.Mesh {
  const tex = plankTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(venue.width / 2.4, venue.depth / 2.4);
  tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(venue.width, venue.depth), std(0xffffff, { map: tex, roughness: 0.5, metalness: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

/** A faint 1 m survey grid on top of the planks. It is a map, after all. */
export function buildGrid(venue: Venue): THREE.LineSegments {
  const verts: number[] = [];
  for (let x = 0; x <= venue.width; x++) verts.push(x - venue.width / 2, 0.006, -venue.depth / 2, x - venue.width / 2, 0.006, venue.depth / 2);
  for (let z = 0; z <= venue.depth; z++) verts.push(-venue.width / 2, 0.006, z - venue.depth / 2, venue.width / 2, 0.006, z - venue.depth / 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: COLORS.grid, transparent: true, opacity: 0.045 }));
}

export function buildWalls(venue: Venue): THREE.Group {
  const g = new THREE.Group();
  const t = 0.14;
  const h = 1.3;
  const w2 = venue.width / 2;
  const d2 = venue.depth / 2;
  const wallM = std(COLORS.wall, { transparent: true, opacity: 0.55, depthWrite: false });
  const capM = std(0x4a515b, { roughness: 0.5, metalness: 0.3 });
  const strip = glow(COLORS.lamp, 0.5);

  // [length, thickness, centre x, centre z, runs along x?]
  const sides: Array<[number, number, number, number, boolean]> = [
    [venue.width + t, t, 0, -d2 - t / 2, true],
    [venue.width + t, t, 0, d2 + t / 2, true],
    [venue.depth + t, t, -w2 - t / 2, 0, false],
    [venue.depth + t, t, w2 + t / 2, 0, false],
  ];
  for (const [len, thick, x, z, alongX] of sides) {
    const wall = new THREE.Group();
    wall.add(rbox(len, h, thick, wallM, 0, h / 2, 0, 0.01, false));
    wall.add(rbox(len + 0.02, 0.05, thick + 0.05, capM, 0, h + 0.02, 0, 0.015, false));
    wall.position.set(x, 0, z);
    if (!alongX) wall.rotation.y = Math.PI / 2;
    g.add(wall);
  }

  // LED strip along the foot of each wall, on the inside
  g.add(rbox(venue.width, 0.04, 0.03, strip, 0, 0.06, -d2 + 0.02, 0.01, false));
  g.add(rbox(venue.width, 0.04, 0.03, strip, 0, 0.06, d2 - 0.02, 0.01, false));
  g.add(rbox(0.03, 0.04, venue.depth, strip, -w2 + 0.02, 0.06, 0, 0.01, false));
  g.add(rbox(0.03, 0.04, venue.depth, strip, w2 - 0.02, 0.06, 0, 0.01, false));

  // corner posts with a lit cap
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(rbox(0.28, 1.9, 0.28, capM, sx * (w2 + t / 2), 0.95, sz * (d2 + t / 2), 0.03));
      g.add(rbox(0.18, 0.05, 0.18, glow(COLORS.lamp, 1.1), sx * (w2 + t / 2), 1.92, sz * (d2 + t / 2), 0.015, false));
    }
  }
  return g;
}

/** Bulbs strung across the room, a little above head height. */
export function buildStringLights(venue: Venue): THREE.Group {
  const g = new THREE.Group();
  const lines = venue.depth > 10 ? 3 : 2;
  const wire = new THREE.LineBasicMaterial({ color: 0x16191d });
  const pole = std(0x16191d, { metalness: 0.4 });
  const w2 = venue.width / 2 + 0.07;
  const positions: number[] = [];
  for (let i = 0; i < lines; i++) {
    const z = -venue.depth / 2 + (venue.depth * (i + 1)) / (lines + 1);
    const points: THREE.Vector3[] = [];
    const n = Math.round(venue.width * 1.4);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const p = new THREE.Vector3(-w2 + u * w2 * 2, 3.1 - 0.55 * Math.sin(Math.PI * u), z);
      points.push(p);
      if (k > 0 && k < n) positions.push(p.x, p.y - 0.05, p.z);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wire));
    for (const s of [-1, 1]) g.add(cyl(0.03, 0.04, 3.1, pole, s * w2, 1.55, z, 8, false));
  }
  const bulbs = new THREE.BufferGeometry();
  bulbs.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.add(new THREE.Points(bulbs, new THREE.PointsMaterial({ map: radialTexture(), color: COLORS.lamp, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  return g;
}

/** Slow specks of dust drifting in the light. */
export function buildDust(venue: Venue): THREE.Points {
  const n = 280;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = (rand(i * 1.1) - 0.5) * venue.width;
    positions[i * 3 + 1] = 0.3 + rand(i * 2.3) * 3.2;
    positions[i * 3 + 2] = (rand(i * 3.7) - 0.5) * venue.depth;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ map: radialTexture(), color: 0xcdd9ee, size: 0.1, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
}

// ---- furniture ----------------------------------------------------------------

export interface FeatureModel extends Built {
  /** Height to hang the name label above. */
  top: number;
}

/** Which way a thing faces: away from the nearest wall. 0 = south (+z), pi/2 = east (+x). */
export function facingOf(f: Pick<Feature, 'x' | 'z'>, venue: Venue): number {
  const west = f.x;
  const east = venue.width - f.x;
  const north = f.z;
  const south = venue.depth - f.z;
  const nearest = Math.min(west, east, north, south);
  if (nearest === north) return 0;
  if (nearest === south) return Math.PI;
  if (nearest === west) return Math.PI / 2;
  return -Math.PI / 2;
}

interface Ctx {
  venue: Venue;
  onUpdate(fn: (t: number) => void): void;
}

type Maker = (g: THREE.Group, L: number, D: number, ctx: Ctx) => number;

const BOTTLES = [0x6b3a14, 0x2d5a34, 0x8fb7c9, 0xb04a2e, 0xe8dfc8];

const stage: Maker = (g, L, D) => {
  const H = 0.45;
  g.add(rbox(L, H, D, std(COLORS.feature.stage, { roughness: 0.8 }), 0, H / 2, 0, 0.03));
  g.add(rbox(L - 0.12, 0.03, D - 0.12, std(0x0d0f12, { roughness: 0.95 }), 0, H + 0.015, 0, 0.01, false));
  const led = glow(COLORS.met, 1.8);
  g.add(rbox(L, 0.035, 0.03, led, 0, H - 0.09, D / 2, 0.01, false));
  for (const s of [-1, 1]) g.add(rbox(0.03, 0.035, D, led, s * (L / 2), H - 0.09, 0, 0.01, false));

  const metal = std(0x16191d, { metalness: 0.7, roughness: 0.35 });
  const speakerM = std(0x14171a, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const speaker = new THREE.Group();
    speaker.position.set(s * (L / 2 - 0.45), H, -D / 2 + 0.4);
    speaker.add(rbox(0.5, 1.1, 0.4, speakerM, 0, 0.55, 0, 0.03));
    for (const y of [0.78, 0.36]) {
      const cone = cyl(0.15, 0.15, 0.02, std(0x070606), 0, y, 0.205, 24, false);
      cone.rotation.x = Math.PI / 2;
      speaker.add(cone);
    }
    g.add(speaker);
    // low floor monitor at the front corner
    const wedge = rbox(0.5, 0.22, 0.32, speakerM, s * (L / 2 - 0.5), H + 0.11, D / 2 - 0.3, 0.03);
    wedge.rotation.x = -0.3;
    g.add(wedge);
  }

  // lighting truss over the back of the stage, with a beam under every lamp
  const trussY = H + 3;
  for (const s of [-1, 1]) g.add(cyl(0.05, 0.05, 3, metal, s * (L / 2 - 0.15), H + 1.5, -D / 2 + 0.2, 10));
  g.add(rbox(L - 0.1, 0.16, 0.16, metal, 0, trussY, -D / 2 + 0.2, 0.02));
  const beamMat = new THREE.MeshBasicMaterial({
    map: gradientTexture('#ffffff', '#000000'),
    color: COLORS.lamp,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lamps = Math.max(3, Math.round(L / 2.2));
  for (let i = 0; i < lamps; i++) {
    const x = -L / 2 + (L * (i + 0.5)) / lamps;
    g.add(cyl(0.08, 0.11, 0.24, metal, x, trussY - 0.18, -D / 2 + 0.3, 14));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.7, trussY - 0.5, 28, 1, true), beamMat);
    beam.position.set(x, (trussY - 0.3) / 2 + 0.2, -D / 2 + 0.3);
    g.add(beam);
  }
  g.add(lightPool(L * 1.05, D * 1.05, COLORS.lamp, 0.2, H + 0.04));
  return H;
};

const bar: Maker = (g, L, D) => {
  const H = 1.05;
  const wood = std(COLORS.feature.bar, { roughness: 0.55 });
  const slat = std(0x555c66, { roughness: 0.5 });
  const cz = D / 2 - 0.38;
  g.add(rbox(L, H - 0.05, 0.76, wood, 0, (H - 0.05) / 2, cz, 0.02));
  const slats = Math.floor(L / 0.22);
  for (let i = 0; i < slats; i++) g.add(rbox(0.1, H - 0.22, 0.03, slat, -L / 2 + (L * (i + 0.5)) / slats, (H - 0.05) / 2, D / 2 - 0.005, 0.01, false));
  g.add(rbox(L + 0.04, 0.05, 0.84, std(0x15181c, { roughness: 0.18, metalness: 0.35 }), 0, H - 0.025, cz, 0.02));

  // back bar: low cabinet, mirror, two shelves of bottles
  g.add(rbox(L, 0.95, 0.45, std(0x1b1e23), 0, 0.475, -D / 2 + 0.25, 0.02));
  g.add(rbox(L - 0.1, 1.2, 0.03, std(0x2a2a30, { metalness: 0.9, roughness: 0.12 }), 0, 1.55, -D / 2 + 0.04, 0.01, false));
  const glassMats = BOTTLES.map((c) => std(c, { transparent: true, opacity: 0.85, roughness: 0.15 }));
  for (const [row, y] of [1.3, 1.75].entries()) {
    g.add(rbox(L - 0.2, 0.04, 0.26, wood, 0, y, -D / 2 + 0.2, 0.01, false));
    const count = Math.floor((L - 0.5) / 0.2);
    for (let i = 0; i < count; i++) {
      const n = row * 100 + i;
      const mat = glassMats[Math.floor(rand(n) * glassMats.length)] as THREE.Material;
      const x = -L / 2 + 0.3 + i * ((L - 0.6) / Math.max(1, count - 1));
      const tall = 0.2 + rand(n * 3) * 0.12;
      g.add(cyl(0.036, 0.04, tall, mat, x, y + 0.02 + tall / 2, -D / 2 + 0.2, 12, false));
      g.add(cyl(0.012, 0.018, 0.09, mat, x, y + 0.02 + tall + 0.04, -D / 2 + 0.2, 8, false));
    }
  }

  // taps and glasses on the counter
  const chrome = std(0xcfcfd4, { metalness: 0.9, roughness: 0.2 });
  for (const f of [-0.25, 0, 0.25]) g.add(cyl(0.015, 0.02, 0.22, chrome, f * L * 0.4, H + 0.11, cz - 0.12, 10, false));
  for (let i = 0; i < Math.floor(L / 0.9); i++) g.add(cyl(0.035, 0.028, 0.1, std(0xdfe8ee, { transparent: true, opacity: 0.55, roughness: 0.1 }), -L / 2 + 0.6 + i * 0.9, H + 0.05, cz + 0.12, 12, false));

  // pendant lights
  const shadeM = std(0x16191d, { side: THREE.DoubleSide, metalness: 0.4 });
  const pendants = Math.max(3, Math.round(L / 1.4));
  for (let i = 0; i < pendants; i++) {
    const x = -L / 2 + (L * (i + 0.5)) / pendants;
    g.add(cyl(0.004, 0.004, 1.1, shadeM, x, 3, cz, 6, false));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shadeM);
    dome.position.set(x, 2.45, cz);
    g.add(dome);
    g.add(ball(0.06, glow(COLORS.lamp, 3.2), x, 2.42, cz));
  }
  g.add(lightPool(L, D * 1.4, COLORS.lamp, 0.3, 0.014));
  return 1.12;
};

const table: Maker = (g, L, D) => {
  const r = Math.min(L, D) / 2;
  const metal = std(0x16191d, { metalness: 0.7, roughness: 0.35 });
  g.add(cyl(0.2, 0.24, 0.04, metal, 0, 0.02, 0, 24));
  g.add(cyl(0.04, 0.05, 1, metal, 0, 0.5, 0, 12));
  g.add(cyl(r, r, 0.05, std(COLORS.feature.table, { roughness: 0.35, metalness: 0.15 }), 0, 1.03, 0, 32));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 40), std(0xaab2bd, { metalness: 0.8, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.055;
  g.add(rim);
  const glass = std(0xdfe8ee, { transparent: true, opacity: 0.5, roughness: 0.1 });
  g.add(cyl(0.035, 0.028, 0.1, glass, -r * 0.45, 1.105, r * 0.2, 12, false));
  g.add(cyl(0.035, 0.028, 0.1, glass, r * 0.4, 1.105, -r * 0.3, 12, false));
  g.add(cyl(0.03, 0.03, 0.03, std(0xf0e6d8), 0, 1.07, 0, 12, false));
  g.add(ball(0.014, glow(0xffb36b, 5), 0, 1.1, 0, 1, 1.6, 1));
  g.add(lightPool(r * 4, r * 4, COLORS.lamp, 0.2, 0.014));
  return 1.06;
};

const booth: Maker = (g, L, D) => {
  const teal = COLORS.feature.booth;
  const cream = std(0xe6e9ee, { roughness: 0.4 });
  g.add(rbox(L, 1.05, 0.6, std(teal, { roughness: 0.5 }), 0, 0.525, D / 2 - 0.3, 0.03));
  g.add(rbox(L + 0.04, 0.04, 0.66, cream, 0, 1.07, D / 2 - 0.3, 0.015));
  g.add(rbox(L, 2.3, 0.08, std(0x14211f), 0, 1.15, -D / 2 + 0.06, 0.02));
  g.add(rbox(L * 0.8, 1, 0.02, glow(0x4fb3a8, 0.9), 0, 1.6, -D / 2 + 0.11, 0.01, false));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 12, 36), glow(0x9ff5e8, 2.4));
  ring.position.set(0, 1.6, -D / 2 + 0.14);
  g.add(ring);
  for (const s of [-1, 1]) {
    g.add(rbox(0.55, 0.05, 0.22, std(0x16191d, { metalness: 0.5 }), s * (L / 2 - 0.35), 0.025, -0.1, 0.01));
    g.add(rbox(0.5, 1.8, 0.03, cream, s * (L / 2 - 0.35), 0.98, -0.1, 0.01));
    g.add(rbox(0.5, 0.45, 0.035, glow(COLORS.met, 0.8), s * (L / 2 - 0.35), 1.45, -0.09, 0.01, false));
  }
  for (let i = 0; i < 4; i++) g.add(rbox(0.28, 0.012, 0.2, std([0xe6e9ee, COLORS.met, 0x4fb3a8, 0xe6e9ee][i] as number), -0.6 + 0.02 * i, 1.1 + i * 0.013, D / 2 - 0.3, 0.004, false));
  g.add(lightPool(L * 1.2, D * 1.6, 0x4fb3a8, 0.22, 0.014));
  return 2.2;
};

const sofa: Maker = (g, L, D) => {
  const fabric = std(COLORS.feature.sofa, { roughness: 0.95 });
  const dark = std(0x2b3544, { roughness: 0.95 });
  g.add(rbox(L, 0.28, D, dark, 0, 0.24, 0, 0.05));
  const n = Math.max(2, Math.round(L / 1.1));
  const seatW = (L - 0.5) / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.25 + seatW * (i + 0.5);
    g.add(rbox(seatW - 0.03, 0.17, D * 0.62, fabric, x, 0.43, D * 0.12, 0.06));
    const back = rbox(seatW - 0.05, 0.46, 0.2, fabric, x, 0.72, -D / 2 + 0.34, 0.07);
    back.rotation.x = -0.12;
    g.add(back);
  }
  g.add(rbox(L, 0.66, D * 0.26, dark, 0, 0.62, -D / 2 + D * 0.13, 0.07));
  for (const s of [-1, 1]) g.add(rbox(0.25, 0.52, D, fabric, s * (L / 2 - 0.125), 0.5, 0, 0.08));
  const accents = [COLORS.met, 0xe6e9ee, 0x4fb3a8];
  accents.forEach((c, i) => {
    const pillow = rbox(0.34, 0.34, 0.1, std(c, { roughness: 0.9 }), -L / 2 + 0.7 + i * (L / 3), 0.68, -D / 2 + 0.55, 0.05);
    pillow.rotation.set(-0.35, (i - 1) * 0.35, (i - 1) * 0.2);
    g.add(pillow);
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.035, 0.03, 0.1, std(0x16191d, { metalness: 0.5 }), sx * (L / 2 - 0.15), 0.05, sz * (D / 2 - 0.15), 8, false));
  g.add(rbox(L + 0.6, 0.012, D + 0.8, std(0x2a2f36, { roughness: 1 }), 0, 0.006, 0.4, 0.004, false));
  return 1;
};

const screen: Maker = (g, L, D, ctx) => {
  const frame = std(COLORS.feature.screen, { metalness: 0.5, roughness: 0.4 });
  g.add(rbox(L, 2.4, 0.12, frame, 0, 2.3, 0, 0.03));
  const tex = screenTexture(ctx.venue.name);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(L - 0.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95, roughness: 0.4 }),
  );
  panel.position.set(0, 2.3, 0.065);
  g.add(panel);
  for (const s of [-1, 1]) g.add(rbox(0.12, 1.1, Math.min(0.16, D), frame, s * (L / 3), 0.55, 0));
  ctx.onUpdate((t) => {
    tex.offset.x = (t * 0.03) % 1;
  });
  return 3.8;
};

const plant: Maker = (g, L, D, ctx) => {
  const r = Math.min(L, D) / 2;
  const pot = std(0x70767e, { roughness: 0.8 });
  g.add(cyl(r * 0.62, r * 0.46, 0.4, pot, 0, 0.2, 0, 24));
  g.add(cyl(r * 0.68, r * 0.68, 0.05, pot, 0, 0.42, 0, 24));
  g.add(cyl(r * 0.58, r * 0.58, 0.02, std(0x16191d), 0, 0.44, 0, 20, false));
  const leafMats = [std(0x3f7a4d, { roughness: 0.7 }), std(0x2f6a40, { roughness: 0.7 }), std(0x56903c, { roughness: 0.7 })];
  const tilters: Array<{ node: THREE.Group; base: number; seed: number }> = [];
  for (let i = 0; i < 10; i++) {
    const spin = new THREE.Group();
    spin.position.y = 0.44;
    spin.rotation.y = i * 2.4;
    const tilt = new THREE.Group();
    const base = 0.3 + (i % 4) * 0.13;
    tilt.rotation.z = base;
    tilt.add(ball(0.1, leafMats[i % 3] as THREE.Material, 0, 0.28 + (i % 3) * 0.05, 0, 0.55, 2.6, 0.16, true));
    spin.add(tilt);
    g.add(spin);
    tilters.push({ node: tilt, base, seed: i });
  }
  ctx.onUpdate((t) => {
    for (const l of tilters) l.node.rotation.z = l.base + Math.sin(t * 1.1 + l.seed) * 0.035;
  });
  return 1.3;
};

const door: Maker = (g, L, D) => {
  const frame = std(0x16191d, { roughness: 0.6 });
  for (const s of [-1, 1]) g.add(rbox(0.1, 2.4, D, frame, s * (L / 2 - 0.05), 1.2, 0, 0.02));
  g.add(rbox(L, 0.12, D, frame, 0, 2.46, 0, 0.02));
  const glass = std(0xbfe3ff, { transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.4, depthWrite: false });
  const leaf = (L - 0.2) / 2;
  for (const s of [-1, 1]) {
    g.add(rbox(leaf - 0.02, 2.3, 0.03, glass, s * (leaf / 2 + 0.01), 1.15, 0, 0.01, false));
    g.add(cyl(0.012, 0.012, 0.5, std(0xcfcfd4, { metalness: 0.9, roughness: 0.2 }), s * 0.07, 1.1, 0.04, 8, false));
  }
  g.add(rbox(0.42, 0.14, 0.05, glow(0x3ddc84, 1.8), 0, 2.68, 0, 0.02, false));
  g.add(rbox(L - 0.3, 0.02, 1, std(0x1b1e23), 0, 0.01, D / 2 + 0.55, 0.01, false));
  // light spilling in from the street, brightest at the door
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.3, 3.4),
    new THREE.MeshBasicMaterial({ map: gradientTexture('#ffffff', '#000000'), color: 0xe6eeff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.02, D / 2 + 1.7);
  spill.renderOrder = 1;
  g.add(spill);
  return 1;
};

const MAKERS: Record<Feature['kind'], Maker> = { stage, bar, table, booth, sofa, screen, plant, door };

export function buildFeature(f: Feature, venue: Venue): FeatureModel {
  const root = new THREE.Group();
  const angle = f.kind === 'table' || f.kind === 'plant' ? 0 : facingOf(f, venue);
  // Facing east or west swaps which side of the box is the "width" of the model.
  const sideways = Math.abs(Math.sin(angle)) > 0.5;
  const L = sideways ? f.d : f.w;
  const D = sideways ? f.w : f.d;

  const g = new THREE.Group();
  g.rotation.y = angle;
  root.add(g);

  const updates: Array<(t: number) => void> = [];
  const top = MAKERS[f.kind](g, L, D, { venue, onUpdate: (fn) => updates.push(fn) });
  return { object: root, top, update: updates.length ? (t) => updates.forEach((fn) => fn(t)) : undefined };
}
