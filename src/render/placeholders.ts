// Stage 01 placeholder assets: simple primitives, colour-coded by gameplay role.
import * as THREE from 'three';
import { Obstacle } from '../sim/arena';
import { CFG } from '../sim/config';

const KIND_COLOR: Record<string, number> = {
  wall: 0x7a7f87, cover: 0x3d79c4, rock: 0x8a6d50, crate: 0xd08a2c, pillar: 0x9a9a9a, lair: 0x7a2a2a,
};

export function obstacleMesh(ob: Obstacle): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({ color: KIND_COLOR[ob.kind] ?? 0x888888, roughness: 0.8 });
  const s = ob.shape;
  const geo = s.kind === 'box'
    ? new THREE.BoxGeometry(s.hw * 2, ob.height, s.hd * 2)
    : new THREE.CylinderGeometry(s.r, s.r, ob.height, 16);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(s.cx, ob.height / 2, s.cz);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export interface CharacterRig { root: THREE.Group; body: THREE.Object3D; gun: THREE.Object3D }

export function playerModel(): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(CFG.player.radius, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color: 0x3fa7ff }));
  body.position.y = 0.9; body.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  gun.position.set(0.5, CFG.weapon.muzzleHeight, 0); // +x is the facing axis
  gun.castShadow = true;
  root.add(body, gun);
  return { root, body, gun };
}

export function monsterModel(): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(CFG.monster.radius, 0.6, 4, 12), new THREE.MeshStandardMaterial({ color: 0xd23c3c }));
  body.position.y = 0.85; body.castShadow = true;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0xffee55, emissive: 0x553300 }));
  eye.position.set(0.45, 1.15, 0);
  root.add(body, eye);
  return { root, body, gun: eye };
}
