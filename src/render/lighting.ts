// Final lighting: dark sci-fi night, local practical lights, player flashlight, roaming light drone.
// Purely visual: gameplay visibility is decided by the sim; lights never reveal hidden monsters.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LampAnchor } from '../assets/environment';
import { buildDrone, DroneRig, beamMaterial } from '../assets/drone';
import { Sim } from '../sim/sim';
import { CFG } from '../sim/config';
import { PlayerRig } from '../assets/player';

/** Closed patrol through the dark parts of the arena (corners, ruins, gates). */
const DRONE_PATH = [
  [-12.5, -12.5], [-5, -15], [3.5, -13], [11.5, -12], [14.5, -4], [12.5, 4], [13.5, 12.5], [5, 14.5], [-3, 13], [-12.5, 13], [-14.5, 5], [-9.5, -1.5], [-14.5, -6],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

export class Lighting {
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly flashlight: THREE.SpotLight;
  readonly nearGlow: THREE.PointLight;
  readonly drone: DroneRig;
  readonly droneSpot: THREE.SpotLight;
  readonly dronePoint: THREE.PointLight;
  readonly practicals: THREE.PointLight[] = [];
  private path = new THREE.CatmullRomCurve3(DRONE_PATH, true, 'centripetal', 0.5);
  private flashBeam: THREE.Mesh;
  droneT = 0; // seconds along the patrol
  droneFrozen = false;
  /** debug: pin the drone above a point */
  droneOverride: THREE.Vector3 | null = null;
  readonly droneSpeed = 2.6; // m/s
  private t = 0;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, lamps: LampAnchor[]) {
    scene.background = new THREE.Color(0x05070b);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.12;
    this.hemi = new THREE.HemisphereLight(0x45679c, 0x1a1214, 0.55);
    scene.add(this.hemi);
    // cold moonlight: gives shapes and long soft shadows
    this.moon = new THREE.DirectionalLight(0x86a6e0, 0.75);
    this.moon.position.set(-14, 22, 8);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(4096, 4096);
    this.moon.shadow.bias = -0.0005; this.moon.shadow.normalBias = 0.02;
    Object.assign(this.moon.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 70 });
    scene.add(this.moon, this.moon.target);

    // player flashlight (rifle-mounted feel; aligned with the aim sector)
    this.flashlight = new THREE.SpotLight(0xfff0d8, 24, CFG.vision.range, (CFG.vision.sectorHalfAngleDeg * Math.PI) / 180, 0.4, 0.85);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0008; this.flashlight.shadow.camera.near = 0.15;
    scene.add(this.flashlight, this.flashlight.target);
    this.flashBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1, 1, 32, 1, true).translate(0, -0.5, 0), beamMaterial(0xffe8c8, 0.06));
    this.flashBeam.renderOrder = 9; this.flashBeam.userData.fx = true; this.flashBeam.frustumCulled = false;
    scene.add(this.flashBeam);
    // near awareness: soft cool light around the player
    this.nearGlow = new THREE.PointLight(0x9ab8e8, 7, CFG.vision.nearRadius * 1.8, 1.6);
    scene.add(this.nearGlow);

    // practical lights from lamp anchors (fixed set => no shader recompiles)
    const pick = (kind: LampAnchor['kind'], max: number) => lamps.filter((l) => l.kind === kind).slice(0, max);
    const sel: LampAnchor[] = [];
    // lair reds: one per gate, sitting over the spawn barricade
    for (const l of lamps.filter((l) => l.kind === 'red' && Math.max(Math.abs(l.pos.x), Math.abs(l.pos.z)) > 18 && Math.min(Math.abs(l.pos.x), Math.abs(l.pos.z)) < 3)) if (!sel.some((s) => s.pos.distanceTo(l.pos) < 3)) sel.push(l);
    sel.push(...pick('amber', 8));
    const cyans = pick('cyan', 12).filter((_, i) => i % 2 === 0); sel.push(...cyans);
    // a few perimeter reds spread around
    const reds = lamps.filter((l) => l.kind === 'red' && !sel.includes(l) && Math.max(Math.abs(l.pos.x), Math.abs(l.pos.z)) < 18);
    for (let i = 0; i < reds.length; i += 3) sel.push(reds[i]);
    for (const l of sel.slice(0, 22)) {
      const isGate = l.kind === 'red' && Math.max(Math.abs(l.pos.x), Math.abs(l.pos.z)) > 18;
      const p = new THREE.PointLight(l.color, l.kind === 'cyan' ? 2.2 : isGate ? 14 : l.kind === 'amber' ? 6 : 3.5, l.kind === 'cyan' ? 3.2 : isGate ? 9 : 6.5, 1.7);
      p.position.copy(l.pos);
      p.userData.kind = l.kind;
      scene.add(p);
      this.practicals.push(p);
    }

    // the drone
    this.drone = buildDrone();
    scene.add(this.drone.root);
    this.droneSpot = new THREE.SpotLight(0xbfdcff, 85, 16, 0.5, 0.55, 1.2);
    this.droneSpot.castShadow = true;
    this.droneSpot.shadow.mapSize.set(1024, 1024);
    this.droneSpot.shadow.bias = -0.0006; this.droneSpot.shadow.camera.near = 0.5;
    scene.add(this.droneSpot, this.droneSpot.target);
    this.dronePoint = new THREE.PointLight(0x5fd8ff, 1.5, 3, 2);
    scene.add(this.dronePoint);
  }

  /** world position of the drone at patrol time t */
  dronePos(t: number) {
    const L = this.path.getLength();
    const u = (((t * this.droneSpeed) / L) % 1 + 1) % 1;
    const p = this.path.getPointAt(u);
    p.y = 4.6 + Math.sin(t * 0.9) * 0.25;
    return p;
  }

  update(dt: number, sim: Sim, player: PlayerRig) {
    if (!this.droneFrozen) { this.t += dt; this.droneT += dt; } // frozen => the whole light rig holds still (checks/evidence)
    // ---- drone
    const D = this.drone;
    const p = this.droneOverride ? this.droneOverride.clone().setY(4.6) : this.dronePos(this.droneT);
    const ahead = this.droneOverride ? p.clone().add(new THREE.Vector3(0, 0, 1)) : this.dronePos(this.droneT + 0.5);
    D.root.position.copy(p);
    const heading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    D.root.rotation.set(0.12, heading, Math.sin(this.t * 1.3) * 0.05, 'YXZ');
    D.rotors.forEach((r, i) => (r.rotation.y += dt * (40 + i * 3)));
    const blink = Math.sin(this.t * 6) > 0.6 ? 1 : 0.1;
    D.navL.emissiveIntensity = 4 * blink; D.navR.emissiveIntensity = 4 * (1.1 - blink);
    // searchlight sweeps slightly ahead and side to side
    const sweep = new THREE.Vector3(Math.sin(this.t * 0.7) * 1.4, 0, Math.cos(this.t * 0.53) * 1.4);
    const lamp = p.clone().add(new THREE.Vector3(0, D.lampY, 0));
    const tgt = new THREE.Vector3(p.x, 0, p.z).add(sweep).add(ahead.clone().sub(p).setY(0).multiplyScalar(0.8));
    this.droneSpot.position.copy(lamp); this.droneSpot.target.position.copy(tgt); this.droneSpot.target.updateMatrixWorld();
    this.dronePoint.position.copy(p);
    // beam cone from lamp to ground spot
    const dir = tgt.clone().sub(lamp); const len = dir.length();
    D.beam.position.set(0, D.lampY, 0);
    D.beam.scale.set(len * Math.tan(this.droneSpot.angle) * 0.85, len, len * Math.tan(this.droneSpot.angle) * 0.85);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    const inv = new THREE.Quaternion(); D.root.getWorldQuaternion(inv); inv.invert();
    D.beam.quaternion.copy(inv.multiply(q));

    // ---- player flashlight: from the rifle muzzle along the aim, slightly downward
    const P = sim.player;
    const muzzle = player.muzzle.getWorldPosition(new THREE.Vector3());
    const ux = Math.cos(P.aimAngle), uz = Math.sin(P.aimAngle);
    this.flashlight.position.set(P.pos.x + ux * 1.15, 1.45, P.pos.z + uz * 1.15); // just past the muzzle: the shooter never shadows his own beam
    this.flashlight.target.position.set(P.pos.x + ux * 7, 0, P.pos.z + uz * 7);
    this.flashlight.target.updateMatrixWorld();
    this.flashlight.intensity = P.alive ? 24 : 0;
    const fdir = this.flashlight.target.position.clone().sub(muzzle); const flen = fdir.length();
    this.flashBeam.position.copy(muzzle);
    this.flashBeam.scale.set(flen * Math.tan(this.flashlight.angle) * 0.55, flen, flen * Math.tan(this.flashlight.angle) * 0.55);
    this.flashBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), fdir.normalize());
    this.flashBeam.visible = P.alive;
    this.nearGlow.position.set(P.pos.x, 2.2, P.pos.z);
    // practical lights flicker a little
    this.practicals.forEach((l, i) => { if (l.userData.base === undefined) l.userData.base = l.intensity; l.intensity = l.userData.base * (0.92 + 0.08 * Math.sin(this.t * (2 + i * 0.37) + i)); });
  }

  info() {
    const p = this.drone.root.position;
    return { droneT: +this.droneT.toFixed(2), drone: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }, droneSpotTarget: this.droneSpot.target.position.toArray().map((v) => +v.toFixed(2)), lights: { practicals: this.practicals.length, shadowCasters: 3 } };
  }
}
