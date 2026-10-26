import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A built 3D model plus an optional per-frame hook. t is seconds. */
export interface Built {
  object: THREE.Object3D;
  update?: (t: number) => void;
}

export function std(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.7, ...extra, color });
}

/** Self-lit material. Bright enough that the bloom pass makes it glow. */
export function glow(color: number, intensity = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
}

function put<T extends THREE.Mesh>(mesh: T, x: number, y: number, z: number, shadow: boolean): T {
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Box with softened edges. Centre is (x, y, z). */
export function rbox(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.02, shadow = true): THREE.Mesh {
  const radius = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return put(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat), x, y, z, shadow);
}

export function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, segments = 20, shadow = true): THREE.Mesh {
  return put(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat), x, y, z, shadow);
}

/** Sphere, optionally squashed into an ellipsoid with sx, sy, sz. */
export function ball(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = false): THREE.Mesh {
  const mesh = put(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat), x, y, z, shadow);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/** Same text always gives the same number, so a person keeps their hair and skin tone. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick from a list using a seed. Different salts give independent picks from one seed. */
export function pick<T>(list: readonly T[], seed: number, salt = 0): T {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 8;
  return list[mixed % list.length] as T;
}

/** Cheap repeatable noise in 0..1. */
export function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
