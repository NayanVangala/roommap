import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { buildPerson, PERSON_HEIGHT } from './models/person';
import { buildDust, buildFeature, buildFloor, buildGrid, buildStringLights, buildWalls, facingOf, gradientTexture } from './models/venue';
import type { EventData, Person, PersonKind, Venue } from './schema';
import { COLORS } from './theme';

/**
 * Turns a validated EventData into a 3D room you can orbit and click.
 * Data coordinates: metres, origin north-west corner, x east, z south.
 * World coordinates: the room is centred on the origin, so world = data - size/2.
 * Nothing in here checks the data. src/validate.ts already did.
 * The shapes themselves live in src/models/.
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
  /** Seconds after the intro starts when this person pops in. */
  delay: number;
  /** Smoothed hover/selected size. */
  grow: number;
  update?: (t: number) => void;
}

interface FeatureNode {
  group: THREE.Object3D;
  delay: number;
}

interface Pulse {
  mesh: THREE.Mesh;
  phase: number;
}

const STAGE_HEIGHT = 0.45;
const INTRO_SECONDS = 2.4;
const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
/** Metres per second when a walk key is held. */
const WALK_SPEED = 6;

const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      const maps = m as THREE.MeshStandardMaterial;
      maps.map?.dispose();
      maps.emissiveMap?.dispose();
      m.dispose();
    }
  });
}

function makeLabel(text: string, opts: { height: number; color?: string; weight?: number; chip?: { text: string; color: string } }): THREE.Sprite {
  const scale = 2;
  const font = `${opts.weight ?? 600} ${26 * scale}px "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2D canvas is not available.');
  probe.font = font;
  const textWidth = Math.ceil(probe.measureText(text).width);
  const h = 44 * scale;
  const chipD = 26 * scale;
  const chipPad = 9 * scale;
  const left = opts.chip ? chipPad + chipD + 8 * scale : 14 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = left + textWidth + 16 * scale;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  ctx.fillStyle = 'rgba(16, 9, 4, 0.82)';
  ctx.strokeStyle = 'rgba(255, 240, 225, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, h - 2, h / 2);
  ctx.fill();
  ctx.stroke();
  if (opts.chip) {
    ctx.fillStyle = opts.chip.color;
    ctx.beginPath();
    ctx.arc(chipPad + chipD / 2, h / 2, chipD / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0d04';
    ctx.font = `500 ${15 * scale}px "DM Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.chip.text, chipPad + chipD / 2, h / 2 + scale);
  }
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color ?? '#f6ece1';
  ctx.fillText(text, left, h / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set((canvas.width / canvas.height) * opts.height, opts.height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class RoomView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
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
  private features: FeatureNode[] = [];
  private updaters: Array<(t: number) => void> = [];
  private pulses: Pulse[] = [];
  private route: THREE.Mesh | null = null;
  private routeCurve: THREE.Curve<THREE.Vector3> | null = null;
  private walker: THREE.Mesh | null = null;
  private dust: THREE.Points | null = null;
  private pickables: THREE.Mesh[] = [];
  private visible: Record<PersonKind, boolean> = { met: true, heard: true };
  private readonly selectionRing: THREE.Mesh;
  private readonly beam: THREE.Mesh;

  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private tweenTarget: THREE.Vector3 | null = null;
  /** Until the user touches the camera, keep the room framed when the window changes shape. */
  private userMoved = false;
  private downAt: { x: number; y: number } | null = null;
  private hoverQueued = false;
  private lastPointer = { x: 0, y: 0 };
  /** Where the camera rests once the intro is over. */
  private restPos = new THREE.Vector3();
  /** Clock time the intro started. Infinity = not started, so everything stays hidden. */
  private introAt = Infinity;
  /** Walk keys currently held, and the bits the walk maths reuses every frame. */
  private readonly walking = new Set<string>();
  private readonly heading = new THREE.Vector3();
  private readonly stopListening = new AbortController();
  private lastT = 0;

  constructor(private readonly container: HTMLElement, private readonly hooks: ViewHooks) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '3D map of the room. Use the list to pick a person with the keyboard.');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(COLORS.ink);
    this.scene.fog = new THREE.Fog(COLORS.ink, 50, 120);
    this.scene.add(this.world);

    // Reflections for glossy surfaces (bar top, glass, metal). Kept dim on purpose.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffe2c6, 0x1a0f08, 0.9));
    const key = new THREE.DirectionalLight(0xffe8d0, 1.5);
    key.position.set(8, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.far = 60;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7aa6ff, 0.45);
    rim.position.set(-10, 8, -12);
    this.scene.add(rim);

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.6, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.focus, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    // A column of light over whoever is selected. Black fades to nothing under additive blending.
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.5, 3.2, 28, 1, true),
      new THREE.MeshBasicMaterial({
        map: gradientTexture('#000000', '#ffffff'),
        color: COLORS.focus,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    // Bloom makes the lit things (LEDs, bulbs, screen) glow. If the browser cannot do it, draw plainly.
    let composer: EffectComposer | null = null;
    try {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(this.renderer, target);
      composer.addPass(new RenderPass(this.scene, this.camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.75, 0.9));
      composer.addPass(new OutputPass());
    } catch (error) {
      console.warn('Post-processing is off.', error);
      composer = null;
    }
    this.composer = composer;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 4;
    // Panning slides along the floor (not up and down), like walking.
    this.controls.screenSpacePanning = false;
    this.bindWalkKeys();
    this.controls.addEventListener('start', () => {
      this.tweenTarget = null;
      this.userMoved = true;
      this.finishIntro();
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
      if (!this.hoverId) this.canvas.style.cursor = 'grabbing';
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const start = this.downAt;
      this.downAt = null;
      this.canvas.style.cursor = this.hoverId ? 'pointer' : 'grab';
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

  /** Replace everything in the room with a new event. It stays hidden until playIntro(). */
  setEvent(event: EventData): void {
    this.scene.remove(this.world);
    disposeTree(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.people.clear();
    this.features = [];
    this.updaters = [];
    this.pulses = [];
    this.route = null;
    this.routeCurve = null;
    this.walker = null;
    this.dust = null;
    this.selectedId = null;
    this.hoverId = null;
    this.selectionRing.visible = false;
    this.beam.visible = false;
    this.venue = event.venue;
    this.introAt = Infinity;

    const { venue } = event;
    this.world.add(buildFloor(venue), buildGrid(venue), buildWalls(venue), buildStringLights(venue));
    this.dust = buildDust(venue);
    this.world.add(this.dust);

    const reach = Math.hypot(venue.width, venue.depth);
    for (const f of venue.features) {
      const model = buildFeature(f, venue);
      const pos = this.toWorld(venue, f.x, f.z);
      model.object.position.copy(pos);
      this.world.add(model.object);
      if (model.update) this.updaters.push(model.update);
      if (f.label) {
        const label = makeLabel(f.label, { height: 0.4, color: '#c9b8a6', weight: 500 });
        label.position.y = model.top + 0.45;
        model.object.add(label);
      }
      this.features.push({ group: model.object, delay: 0.1 + (Math.hypot(f.x - venue.width / 2, f.z - venue.depth / 2) / reach) * 0.8 });
    }

    const met = event.people.filter((p) => p.kind === 'met').sort((a, b) => a.order - b.order);
    for (const p of event.people) this.addPerson(p, event, met);
    this.buildRoute(event, met);
    this.applyVisibility();
    this.resetView();
  }

  /** Start the entrance: furniture rises, people pop in, the camera swoops down. */
  playIntro(): void {
    this.introAt = this.reducedMotion ? -1e9 : performance.now() / 1000;
  }

  private finishIntro(): void {
    if (this.introAt !== Infinity) this.introAt = -1e9;
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
    this.beam.visible = !!node;
    if (node) {
      this.finishIntro();
      this.selectionRing.position.set(node.group.position.x, node.baseY + 0.04, node.group.position.z);
      this.beam.position.set(node.group.position.x, node.baseY + 1.6, node.group.position.z);
      this.tweenTarget = new THREE.Vector3(node.group.position.x, 0.8, node.group.position.z);
    } else {
      this.tweenTarget = null;
    }
  }

  resetView(): void {
    this.userMoved = false;
    this.frame();
  }

  /** WASD or arrow keys glide you across the floor, relative to where the camera looks. */
  private bindWalkKeys(): void {
    const signal = this.stopListening.signal;
    window.addEventListener(
      'keydown',
      (e) => {
        const key = e.key.toLowerCase();
        if (!WALK_KEYS.includes(key) || e.metaKey || e.ctrlKey || e.altKey) return;
        const from = e.target as HTMLElement;
        const typing = from.closest?.('input, textarea, select, [role="tab"]') || document.querySelector('dialog[open]');
        if (typing || this.container.closest('[inert]')) return;
        this.walking.add(key);
        e.preventDefault();
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.walking.delete(e.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.walking.clear(), { signal });
  }

  private walk(dt: number): void {
    const has = (...keys: string[]) => (keys.some((k) => this.walking.has(k)) ? 1 : 0);
    const forward = has('w', 'arrowup') - has('s', 'arrowdown');
    const sideways = has('d', 'arrowright') - has('a', 'arrowleft');
    if (!forward && !sideways) return;
    this.camera.getWorldDirection(this.heading);
    this.heading.y = 0;
    this.heading.normalize();
    // Forward is where the camera looks along the floor. Right is a quarter turn from that.
    const { x, z } = this.heading;
    const step = new THREE.Vector3(x * forward - z * sideways, 0, z * forward + x * sideways);
    step.normalize().multiplyScalar(WALK_SPEED * dt);
    this.controls.target.add(step);
    this.camera.position.add(step);
    this.tweenTarget = null;
    this.userMoved = true;
    this.finishIntro();
  }

  /** What a plain drag does. Shift-drag (or right-drag) always does the other one. */
  setDragMode(mode: 'orbit' | 'pan'): void {
    const pan = mode === 'pan';
    this.controls.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    this.controls.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
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
    this.restPos.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.camera.position.copy(this.restPos);
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
    this.stopListening.abort();
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeTree(this.world);
    this.composer?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---- building ----------------------------------------------------------

  private toWorld(venue: Venue, x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x - venue.width / 2, 0, z - venue.depth / 2);
  }

  private addPerson(p: Person, event: EventData, met: Person[]): void {
    const { venue } = event;
    const heard = p.kind === 'heard';
    const color = heard ? COLORS.heard : COLORS.met;
    const stage = venue.features.find((f) => f.kind === 'stage' && Math.abs(p.x - f.x) <= f.w / 2 && Math.abs(p.z - f.z) <= f.d / 2);
    const baseY = stage ? STAGE_HEIGHT : 0;

    const group = new THREE.Group();
    const pos = this.toWorld(venue, p.x, p.z);
    group.position.set(pos.x, baseY, pos.z);

    const model = buildPerson(p, color);
    group.add(model.object);

    // Who they face: speakers face the room, the audience faces the stage, people you met face where you came from.
    const lookAt = (x: number, z: number) => Math.atan2(x - p.x, z - p.z);
    const anyStage = venue.features.find((f) => f.kind === 'stage');
    if (stage) model.object.rotation.y = facingOf(stage, venue);
    else if (heard) model.object.rotation.y = anyStage ? lookAt(anyStage.x, anyStage.z) : lookAt(venue.width / 2, venue.depth / 2);
    else {
      const i = met.findIndex((m) => m.id === p.id);
      const door = venue.features.find((f) => f.kind === 'door');
      const from = i > 0 ? met[i - 1] : undefined;
      const fx = from ? from.x : door ? door.x : venue.width / 2;
      const fz = from ? from.z : door ? door.z : venue.depth;
      model.object.rotation.y = lookAt(fx, fz);
    }

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1;
    hit.userData.personId = p.id;

    const label = makeLabel(p.name, {
      height: 0.4,
      color: heard ? '#cfe3ff' : '#ffd9c4',
      chip: { text: String(p.order).padStart(2, '0'), color: heard ? '#9cc9ff' : '#ff8539' },
    });
    label.position.y = 2.2;
    group.add(hit, label);

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
    this.people.set(p.id, { person: p, group, hit, baseY, delay: 0.55 + p.order * 0.07, grow: 1, update: model.update });
  }

  private buildRoute(event: EventData, met: Person[]): void {
    const { venue } = event;
    const door = venue.features.find((f) => f.kind === 'door');
    const points: THREE.Vector3[] = [];
    if (door) points.push(this.toWorld(venue, door.x, door.z - 0.6));
    for (const p of met) points.push(this.toWorld(venue, p.x, p.z));
    if (points.length < 2) return;
    for (const pt of points) pt.y = 0.06;
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.routeCurve = curve;
    this.route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, points.length * 14, 0.028, 6, false),
      new THREE.MeshBasicMaterial({ color: COLORS.route, transparent: true, opacity: 0.55 }),
    );
    this.world.add(this.route);
    // A small light that walks the route, so the order of the night reads at a glance.
    this.walker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd9b0 }));
    this.walker.scale.setScalar(1.4);
    this.world.add(this.walker);
  }

  // ---- interaction -------------------------------------------------------

  private applyVisibility(): void {
    this.pickables = [];
    for (const node of this.people.values()) {
      const on = this.visible[node.person.kind];
      node.group.visible = on;
      if (on) this.pickables.push(node.hit);
    }
    const showRoute = this.visible.met;
    if (this.route) this.route.visible = showRoute;
    if (this.walker) this.walker.visible = showRoute;
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
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved && this.venue) this.frame();
  }

  private tick(time: number): void {
    const t = time / 1000;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    // Another tab is showing (its page is marked inert). Do not burn the GPU on a room nobody can see.
    if (this.container.closest('[inert]')) return;
    this.walk(dt);
    // Seconds since the intro began. -Infinity (not started) keeps everything at scale 0.
    const since = this.introAt === Infinity ? -Infinity : performance.now() / 1000 - this.introAt;

    if (this.tweenTarget) {
      const step = this.tweenTarget.clone().sub(this.controls.target).multiplyScalar(0.12);
      this.controls.target.add(step);
      this.camera.position.add(step);
      if (step.length() < 0.004) this.tweenTarget = null;
    }

    // Camera swoops in from higher and off to one side while the intro plays.
    if (since < INTRO_SECONDS && !this.userMoved) {
      const k = easeOutCubic(clamp01(since / INTRO_SECONDS));
      const offset = this.restPos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (1 - k) * 0.9).multiplyScalar(1 + (1 - k) * 0.55);
      this.camera.position.copy(this.controls.target).add(offset);
    }
    this.controls.update();

    // Keep the point you are looking at inside the room, so you cannot drag off into the void.
    if (this.venue) {
      const target = this.controls.target;
      const dx = THREE.MathUtils.clamp(target.x, -this.venue.width / 2, this.venue.width / 2) - target.x;
      const dz = THREE.MathUtils.clamp(target.z, -this.venue.depth / 2, this.venue.depth / 2) - target.z;
      if (dx || dz) {
        target.x += dx;
        target.z += dz;
        this.camera.position.x += dx;
        this.camera.position.z += dz;
      }
    }

    for (const update of this.updaters) update(this.reducedMotion ? 0 : t);

    for (const f of this.features) f.group.scale.set(1, Math.max(0.0001, easeOutCubic(clamp01((since - f.delay) / 0.9))), 1);

    for (const node of this.people.values()) {
      const wanted = node.person.id === this.hoverId || node.person.id === this.selectedId ? 1.1 : 1;
      node.grow += (wanted - node.grow) * 0.2;
      const pop = easeOutBack(clamp01((since - node.delay) / 0.7));
      node.group.scale.setScalar(Math.max(0.0001, node.grow * pop));
      node.update?.(this.reducedMotion ? 0 : t);
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

    if (this.walker && this.routeCurve && !this.reducedMotion) {
      this.walker.position.copy(this.routeCurve.getPointAt((t * 0.045) % 1));
      this.walker.position.y = 0.12;
    }

    if (this.dust && !this.reducedMotion) {
      this.dust.rotation.y = t * 0.012;
      this.dust.position.y = Math.sin(t * 0.15) * 0.25;
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
