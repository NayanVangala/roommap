import * as THREE from 'three';
import type { Person } from '../schema';
import { ball, cyl, hash, pick, rbox, std, type Built } from './parts';

/**
 * A little low-poly person built from primitives.
 * Looks come from a hash of the id, so the same person always looks the same.
 * Met people wear the accent colour and a name badge. Heard people are see-through ghosts.
 * The model faces +z. The scene turns the group to face where it should.
 */

const SKIN = [0xf1c9a5, 0xe0ac84, 0xc68863, 0x9c6a48, 0x7a4e33, 0x5a3825];
const HAIR = [0x1b1410, 0x3a2416, 0x6b4426, 0xb8803c, 0xd9c7a0, 0x8a8a90, 0x7a2e22];
const PANTS = [0x1f2430, 0x2b2f3a, 0x3b3a36, 0x4a4233, 0x2a3b4a];
const SHOES = [0xefe9df, 0x15110d, 0x8a5a3a];
const BEANIES = [0x2b2f3a, 0xefe9df, 0xc0452f];
const STYLES = ['short', 'long', 'bun', 'beanie', 'bald', 'curly', 'short', 'long'] as const;

export const PERSON_HEIGHT = 1.75;

/** The top of the head: a partial sphere that leaves the face uncovered. */
function hairCap(mat: THREE.Material, r = 0.123, theta = 0.55): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, Math.PI * theta), mat);
  mesh.position.set(0, 0.125, -0.006);
  mesh.scale.set(0.93, 1.1, 1.04);
  mesh.rotation.x = -0.18;
  return mesh;
}

export function buildPerson(p: Person, color: number): Built {
  const seed = hash(p.id);
  const ghost = p.kind === 'heard';
  const style = pick(STYLES, seed, 5);
  const glasses = pick([false, true, false], seed, 6);
  const holdsCup = pick([false, true, false, false], seed, 7);
  const longSleeves = pick([true, false], seed, 8);
  const talks = !ghost && pick([true, false, true], seed, 9);
  const phase = (seed % 628) / 100;

  // Ghosts share two see-through materials. Everyone else gets real colours.
  const holo = (opacity: number, intensity: number) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, transparent: true, opacity, depthWrite: false });
  const ghostBody = ghost ? holo(0.48, 0.45) : null;
  const ghostHead = ghost ? holo(0.8, 0.6) : null;

  const topM = ghostBody ?? std(color, { roughness: 0.75, emissive: color, emissiveIntensity: 0.1 });
  const skinM = ghostHead ?? std(pick(SKIN, seed, 1), { roughness: 0.6 });
  const hairM = ghostHead ?? std(pick(HAIR, seed, 2), { roughness: 0.9 });
  const pantsM = ghostBody ?? std(pick(PANTS, seed, 3), { roughness: 0.85 });
  const shoeM = ghostBody ?? std(pick(SHOES, seed, 4), { roughness: 0.7 });
  const darkM = ghostBody ?? std(0x120c08, { roughness: 0.5 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // legs and shoes
  for (const s of [-1, 1]) {
    body.add(cyl(0.072, 0.06, 0.78, pantsM, s * 0.085, 0.46, 0, 14));
    body.add(rbox(0.115, 0.08, 0.27, shoeM, s * 0.085, 0.04, 0.045, 0.035));
  }
  body.add(rbox(0.31, 0.17, 0.2, pantsM, 0, 0.88, 0, 0.06));

  // torso, belt, shoulders, neck
  const torso = cyl(0.18, 0.152, 0.56, topM, 0, 1.18, 0, 24);
  torso.scale.z = 0.62;
  body.add(torso);
  const belt = cyl(0.154, 0.154, 0.03, darkM, 0, 0.93, 0, 24, false);
  belt.scale.z = 0.64;
  body.add(belt);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.27, 4, 10), topM);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 1.42;
  shoulders.scale.z = 0.8;
  shoulders.castShadow = true;
  body.add(shoulders);
  body.add(cyl(0.045, 0.05, 0.1, skinM, 0, 1.49, 0, 12));

  // arms: upper arm, elbow joint, forearm, hand
  const elbows: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.215, 1.41, 0);
    arm.rotation.set(-0.12, 0, s * 0.1);
    arm.add(cyl(0.048, 0.042, 0.3, topM, 0, -0.15, 0, 12));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.rotation.x = -0.4;
    elbow.add(cyl(0.042, 0.036, 0.26, longSleeves ? topM : skinM, 0, -0.13, 0, 12));
    elbow.add(ball(0.04, skinM, 0, -0.29, 0));
    arm.add(elbow);
    body.add(arm);
    elbows.push(elbow);
  }
  const talkArm = elbows[0] as THREE.Group;
  const cupArm = elbows[1] as THREE.Group;
  if (holdsCup) {
    cupArm.rotation.x = -1.45;
    // Turn the cup back so it stands upright in world space.
    const cup = cyl(0.034, 0.027, 0.1, ghostBody ?? std(0xf4efe6, { roughness: 0.4 }), 0, -0.29, 0.05, 14);
    cup.rotation.x = 1.45;
    cupArm.add(cup);
  }

  // head: neck pivot, face, hair, glasses
  const head = new THREE.Group();
  head.position.y = 1.5;
  head.add(ball(0.115, skinM, 0, 0.125, 0, 0.92, 1.1, 1, true));
  if (!ghost) {
    for (const s of [-1, 1]) head.add(ball(0.013, darkM, s * 0.04, 0.14, 0.104));
  }
  const hairParts: THREE.Object3D[] = [];
  switch (style) {
    case 'short':
      hairParts.push(hairCap(hairM));
      break;
    case 'long':
      hairParts.push(hairCap(hairM), rbox(0.23, 0.3, 0.075, hairM, 0, 0, -0.085, 0.035));
      break;
    case 'bun':
      hairParts.push(hairCap(hairM), ball(0.05, hairM, 0, 0.27, -0.06));
      break;
    case 'beanie': {
      const beanieM = ghostHead ?? std(pick(BEANIES, seed, 10), { roughness: 0.95 });
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 24), beanieM);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = 0.14;
      hairParts.push(hairCap(beanieM, 0.13, 0.62), brim);
      break;
    }
    case 'curly': {
      hairParts.push(hairCap(hairM, 0.118, 0.5));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        hairParts.push(ball(0.05, hairM, Math.cos(a) * 0.085, 0.2 + (i % 2) * 0.03, Math.sin(a) * 0.085 - 0.02));
      }
      break;
    }
    case 'bald':
      break;
  }
  for (const part of hairParts) head.add(part);
  if (glasses && !ghost) {
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 18), darkM);
      lens.position.set(s * 0.047, 0.14, 0.104);
      head.add(lens);
    }
    head.add(rbox(0.03, 0.006, 0.006, darkM, 0, 0.145, 0.108, 0.002, false));
  }
  body.add(head);

  // name badge on a lanyard, only for people you met
  if (!ghost && p.kind === 'met') {
    const strap = std(0x3a1d0c, { roughness: 0.8 });
    for (const s of [-1, 1]) {
      const band = rbox(0.012, 0.3, 0.012, strap, s * 0.07, 1.34, 0.117, 0.004, false);
      band.rotation.z = s * -0.3;
      body.add(band);
    }
    body.add(rbox(0.078, 0.1, 0.01, std(0xf6ece1, { roughness: 0.5 }), 0, 1.2, 0.121, 0.004, false));
    body.add(rbox(0.078, 0.026, 0.012, std(color, { emissive: color, emissiveIntensity: 0.6 }), 0, 1.235, 0.123, 0.004, false));
  }

  // pad on the floor under their feet
  const padMat = (opacity: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 48), padMat(0.9));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), padMat(ghost ? 0.1 : 0.16));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.028;
  root.add(ring, disc);

  // Ghosts do not throw shadows.
  if (ghost) root.traverse((o) => ((o as THREE.Mesh).castShadow = false));

  return {
    object: root,
    update(t) {
      const s = t + phase;
      torso.scale.y = 1 + Math.sin(s * 1.8) * 0.012;
      body.rotation.z = Math.sin(s * 0.9) * 0.012;
      head.rotation.y = ghost ? Math.sin(s * 0.5) * 0.5 : Math.sin(s * 0.7) * 0.2;
      head.rotation.x = Math.sin(s * 1.3) * 0.04;
      if (talks) talkArm.rotation.x = -0.9 + Math.sin(s * 2.6) * 0.28;
    },
  };
}
