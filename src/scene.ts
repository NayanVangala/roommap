import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EventData, Feature, Person, PersonKind, Venue } from './schema';
import { COLORS } from './theme';

/**
 * Turns a validated EventData into a 3D room you can orbit and click.
 * Data coordinates: metres, origin north-west corner, x east, z south.
 * World coordinates: the room is centred on the origin, so world = data - size/2.
 * Nothing in here checks the data. src/validate.ts already did.
 */

export interface ViewHooks {
  onSelect(id: string | null): void;
  onHover(id: string | null, clientX: number, clientY: number): void;
}

interface PersonNode {
  person: Person;
  group: THREE.Group;
  hit: THREE.Mesh;
  baseY: number;
}

interface Pulse {
  mesh: THREE.Mesh;
  phase: number;
}

const STAGE_HEIGHT = 0.45;
const PERSON_HEIGHT = 1.45;

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}

function makeLabel(text: string, opts: { height: number; color?: string; weight?: number }): THREE.Sprite {
  const scale = 2;
  const font = `${opts.weight ?? 600} ${28 * scale}px ui-sans-serif, system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2D canvas is not available.');
  probe.font = font;
  const textWidth = Math.ceil(probe.measureText(text).width);
  const padX = 14 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = textWidth + padX * 2;
  canvas.height = 44 * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(15, 19, 24, 0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 10 * scale);
  ctx.fill();
  ctx.fillStyle = opts.color ?? '#e8ecf1';
  ctx.fillText(text, padX, canvas.height / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set((canvas.width / canvas.height) * opts.height, opts.height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function box(w: number, h: number, d: number, color: number, y: number, extra?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class RoomView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  private readonly controls: OrbitControls;
  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly canvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private world = new THREE.Group();
  private venue: Venue | null = null;
  private people = new Map<string, PersonNode>();
  private pulses: Pulse[] = [];
  private route: THREE.Line | null = null;
  private pickables: THREE.Mesh[] = [];
  private visible: Record<PersonKind, boolean> = { met: true, heard: true };
  private readonly selectionRing: THREE.Mesh;

  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private tweenTarget: THREE.Vector3 | null = null;
  /** Until the user touches the camera, keep the room framed when the window changes shape. */
  private userMoved = false;
  private downAt: { x: number; y: number } | null = null;
  private hoverQueued = false;
  private lastPointer = { x: 0, y: 0 };

  constructor(private readonly container: HTMLElement, private readonly hooks: ViewHooks) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '3D map of the room. Use the list to pick a person with the keyboard.');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(COLORS.ink);
    this.scene.add(this.world);

    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x2a323d, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.6, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.focus, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 4;
    this.controls.addEventListener('start', () => {
      this.tweenTarget = null;
      this.userMoved = true;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const start = this.downAt;
      this.downAt = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      this.hooks.onSelect(this.pick(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (e.buttons || this.hoverQueued) return;
      this.hoverQueued = true;
      requestAnimationFrame(() => {
        this.hoverQueued = false;
        this.setHover(this.pick(this.lastPointer.x, this.lastPointer.y));
      });
    });
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  /** Replace everything in the room with a new event. */
  setEvent(event: EventData): void {
    this.scene.remove(this.world);
    disposeTree(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.people.clear();
    this.pulses = [];
    this.route = null;
    this.selectedId = null;
    this.hoverId = null;
    this.selectionRing.visible = false;
    this.venue = event.venue;

    this.buildRoom(event.venue);
    for (const f of event.venue.features) this.world.add(this.buildFeature(f, event.venue));
    for (const p of event.people) this.addPerson(p, event.venue);
    this.buildRoute(event);
    this.applyVisibility();
    this.resetView();
  }

  setKindVisible(kind: PersonKind, on: boolean): void {
    this.visible[kind] = on;
    this.applyVisibility();
    if (this.selectedId) {
      const node = this.people.get(this.selectedId);
      if (node && !this.visible[node.person.kind]) this.hooks.onSelect(null);
    }
  }

  select(id: string | null): void {
    this.selectedId = id && this.people.has(id) ? id : null;
    const node = this.selectedId ? this.people.get(this.selectedId) : undefined;
    this.selectionRing.visible = !!node;
    if (node) {
      this.selectionRing.position.set(node.group.position.x, node.baseY + 0.03, node.group.position.z);
      this.tweenTarget = new THREE.Vector3(node.group.position.x, 0.8, node.group.position.z);
    } else {
      this.tweenTarget = null;
    }
  }

  resetView(): void {
    this.userMoved = false;
    this.frame();
  }

  /** Back the camera up until the whole room fits, whatever shape the window is. */
  private frame(): void {
    const v = this.venue;
    const width = v?.width ?? 24;
    const depth = v?.depth ?? 16;
    const pitch = THREE.MathUtils.degToRad(58);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const fitWidth = ((width / 2) * 1.32) / Math.tan(hHalf);
    const fitDepth = (((depth / 2) * Math.sin(pitch) + 1.5) * 1.25) / Math.tan(vHalf);
    const distance = Math.max(fitWidth, fitDepth);
    this.tweenTarget = null;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.controls.maxDistance = Math.max(width, depth) * 2.4;
    this.controls.update();
  }

  /** Client (CSS pixel) coordinates of a person's head. Used by tests and tooltips. */
  screenOf(id: string): { x: number; y: number } | null {
    const node = this.people.get(id);
    if (!node) return null;
    const p = new THREE.Vector3(node.group.position.x, node.baseY + PERSON_HEIGHT * 0.7, node.group.position.z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeTree(this.world);
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---- building ----------------------------------------------------------

  private toWorld(venue: Venue, x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x - venue.width / 2, 0, z - venue.depth / 2);
  }

  private buildRoom(venue: Venue): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(venue.width, venue.depth),
      new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.world.add(floor);

    const verts: number[] = [];
    for (let x = 0; x <= venue.width; x++) verts.push(x - venue.width / 2, 0.005, -venue.depth / 2, x - venue.width / 2, 0.005, venue.depth / 2);
    for (let z = 0; z <= venue.depth; z++) verts.push(-venue.width / 2, 0.005, z - venue.depth / 2, venue.width / 2, 0.005, z - venue.depth / 2);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.world.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: COLORS.grid, transparent: true, opacity: 0.55 })));

    const t = 0.14;
    const h = 1.3;
    const wallMat = { color: COLORS.wall, transparent: true, opacity: 0.5 } as const;
    const walls: Array<[number, number, number, number]> = [
      [venue.width + t, t, 0, -venue.depth / 2 - t / 2],
      [venue.width + t, t, 0, venue.depth / 2 + t / 2],
      [t, venue.depth + t, -venue.width / 2 - t / 2, 0],
      [t, venue.depth + t, venue.width / 2 + t / 2, 0],
    ];
    for (const [w, d, x, z] of walls) {
      const wall = box(w, h, d, COLORS.wall, h / 2, wallMat);
      wall.castShadow = false;
      wall.position.x = x;
      wall.position.z = z;
      this.world.add(wall);
    }
  }

  private buildFeature(f: Feature, venue: Venue): THREE.Group {
    const g = new THREE.Group();
    const c = COLORS.feature[f.kind];
    const pos = this.toWorld(venue, f.x, f.z);
    g.position.copy(pos);
    let top = 1;

    switch (f.kind) {
      case 'stage':
        g.add(box(f.w, STAGE_HEIGHT, f.d, c, STAGE_HEIGHT / 2));
        top = STAGE_HEIGHT;
        break;
      case 'bar': {
        g.add(box(f.w, 1.05, f.d, c, 0.525));
        g.add(box(f.w + 0.1, 0.07, f.d + 0.1, 0x8a6a55, 1.085));
        top = 1.12;
        break;
      }
      case 'table': {
        const r = Math.min(f.w, f.d) / 2;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1, 12), new THREE.MeshStandardMaterial({ color: 0x2c333d, roughness: 0.6 }));
        pole.position.y = 0.5;
        pole.castShadow = true;
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 28), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
        disc.position.y = 1.03;
        disc.castShadow = true;
        disc.receiveShadow = true;
        g.add(pole, disc);
        top = 1.06;
        break;
      }
      case 'booth':
        g.add(box(f.w, 1.05, f.d, c, 0.525));
        g.add(box(f.w * 0.8, 1.1, 0.08, 0x4fb3a8, 1.6, { emissive: 0x4fb3a8, emissiveIntensity: 0.25 }));
        top = 2.2;
        break;
      case 'sofa': {
        g.add(box(f.w, 0.45, f.d, c, 0.225));
        const away = f.z >= venue.depth / 2 ? 1 : -1;
        const back = box(f.w, 0.55, f.d * 0.25, c, 0.72);
        back.position.z = away * f.d * 0.375;
        g.add(back);
        top = 1;
        break;
      }
      case 'screen':
        g.add(box(f.w, 2.4, f.d, c, 2.3, { emissive: 0x5b7fb5, emissiveIntensity: 0.35 }));
        top = 3.8;
        break;
      case 'plant': {
        const r = Math.min(f.w, f.d) / 2;
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.45, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x5a4a3f, roughness: 0.9 }));
        pot.position.y = 0.2;
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 16, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
        leaves.position.y = 0.95;
        leaves.castShadow = true;
        g.add(pot, leaves);
        top = 1.7;
        break;
      }
      case 'door':
        g.add(box(f.w, 0.04, f.d + 0.1, c, 0.02, { emissive: c, emissiveIntensity: 0.3 }));
        top = 0.3;
        break;
    }

    if (f.label) {
      const label = makeLabel(f.label, { height: 0.42, color: '#aab6c6', weight: 500 });
      label.position.y = top + 0.45;
      g.add(label);
    }
    return g;
  }

  private addPerson(p: Person, venue: Venue): void {
    const heard = p.kind === 'heard';
    const color = heard ? COLORS.heard : COLORS.met;
    const onStage = venue.features.some((f) => f.kind === 'stage' && Math.abs(p.x - f.x) <= f.w / 2 && Math.abs(p.z - f.z) <= f.d / 2);
    const baseY = onStage ? STAGE_HEIGHT : 0;

    const group = new THREE.Group();
    const pos = this.toWorld(venue, p.x, p.z);
    group.position.set(pos.x, baseY, pos.z);

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      emissive: color,
      emissiveIntensity: heard ? 0.3 : 0.14,
      transparent: heard,
      opacity: heard ? 0.6 : 1,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.85, 6, 16), material);
    body.position.y = 0.625;
    body.castShadow = !heard;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), material);
    head.position.y = 1.44;
    head.castShadow = !heard;

    const base = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.4, 40),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.9, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.95;
    hit.userData.personId = p.id;

    const label = makeLabel(p.name, { height: 0.38, color: heard ? '#b9d4ff' : '#ffd2c4' });
    label.position.y = 2.0;

    group.add(body, head, base, hit, label);

    if (heard) {
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.4, 0.43, 48),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        group.add(ring);
        this.pulses.push({ mesh: ring, phase: i * 0.5 });
      }
    }

    this.world.add(group);
    this.people.set(p.id, { person: p, group, hit, baseY });
  }

  private buildRoute(event: EventData): void {
    const { venue } = event;
    const met = event.people.filter((p) => p.kind === 'met').sort((a, b) => a.order - b.order);
    const door = venue.features.find((f) => f.kind === 'door');
    const points: THREE.Vector3[] = [];
    if (door) points.push(this.toWorld(venue, door.x, door.z - 0.6));
    for (const p of met) points.push(this.toWorld(venue, p.x, p.z));
    if (points.length < 2) return;
    for (const pt of points) pt.y = 0.045;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({ color: COLORS.route, dashSize: 0.3, gapSize: 0.22, transparent: true, opacity: 0.55 }),
    );
    line.computeLineDistances();
    this.route = line;
    this.world.add(line);
  }

  // ---- interaction -------------------------------------------------------

  private applyVisibility(): void {
    this.pickables = [];
    for (const node of this.people.values()) {
      const on = this.visible[node.person.kind];
      node.group.visible = on;
      if (on) this.pickables.push(node.hit);
    }
    if (this.route) this.route.visible = this.visible.met;
  }

  private pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(this.pickables, false)[0];
    const id = hit?.object.userData.personId;
    return typeof id === 'string' ? id : null;
  }

  private setHover(id: string | null): void {
    this.hoverId = id;
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.hooks.onHover(id, this.lastPointer.x, this.lastPointer.y);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved && this.venue) this.frame();
  }

  private tick(time: number): void {
    const t = time / 1000;

    if (this.tweenTarget) {
      const step = this.tweenTarget.clone().sub(this.controls.target).multiplyScalar(0.12);
      this.controls.target.add(step);
      this.camera.position.add(step);
      if (step.length() < 0.004) this.tweenTarget = null;
    }
    this.controls.update();

    for (const node of this.people.values()) {
      const grow = node.person.id === this.hoverId || node.person.id === this.selectedId ? 1.1 : 1;
      node.group.scale.lerp(new THREE.Vector3(grow, grow, grow), 0.2);
    }

    for (const pulse of this.pulses) {
      const material = pulse.mesh.material as THREE.MeshBasicMaterial;
      if (this.reducedMotion) {
        pulse.mesh.scale.setScalar(1.5 + pulse.phase);
        material.opacity = 0.25;
      } else {
        const k = (t * 0.45 + pulse.phase) % 1;
        pulse.mesh.scale.setScalar(1 + k * 2.2);
        material.opacity = 0.45 * (1 - k);
      }
    }

    if (this.selectionRing.visible) {
      const s = this.reducedMotion ? 1 : 1 + Math.sin(t * 3.2) * 0.06;
      this.selectionRing.scale.setScalar(s);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
