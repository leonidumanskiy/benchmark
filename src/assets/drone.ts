// Light drone: hovering quad-rotor with a downward searchlight and a fake volumetric beam.
import * as THREE from 'three';
import { Kit, G, joint } from './kit';
import { withPanels, glow } from './materials';

export interface DroneRig { root: THREE.Group; rotors: THREE.Group[]; beam: THREE.Mesh; lampY: number; navL: THREE.MeshStandardMaterial; navR: THREE.MeshStandardMaterial; ring: THREE.MeshStandardMaterial }

export function beamMaterial(color: number, strength: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = projectionMatrix[3][3] > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz + vec3(0.0, 0.0, 1e-4)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.5); float fall = pow(clamp(vY, 0.0, 1.0), 1.6); vec3 c = max(uColor * uStrength * edge * fall, vec3(0.0)); gl_FragColor = vec4(c, 1.0); }`,
  });
}

export function buildDrone(): DroneRig {
  const mats = {
    hull: withPanels('#3b4048', 0.45, 0.6, 2, 3, 0.4),
    dark: new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.5, metalness: 0.6 }),
    accent: withPanels('#b8261d', 0.5, 0.3, 2, 3, 0.2),
    lens: glow('#e8f4ff', 6),
    ring: glow('#5fd8ff', 2.2) as THREE.MeshStandardMaterial,
    navL: glow('#ff2a1a', 4) as THREE.MeshStandardMaterial,
    navR: glow('#2aff6a', 4) as THREE.MeshStandardMaterial,
  };
  const k = new Kit(mats);
  const root = new THREE.Group(); root.name = 'drone';
  const body = joint('body', root);
  k.add(body, G.cyl(0.32, 0.4, 0.18, 16), 'hull', [0, 0, 0]);
  k.add(body, G.sph(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'hull', [0, 0.08, 0], [0, 0, 0], [1, 0.5, 1]);
  k.add(body, G.torus(0.37, 0.025, 6, 32), 'ring', [0, -0.02, 0], [Math.PI / 2, 0, 0]);
  k.add(body, G.cyl(0.14, 0.18, 0.12, 14), 'dark', [0, -0.14, 0]);
  k.add(body, G.cyl(0.11, 0.11, 0.02, 14), 'lens', [0, -0.205, 0]);
  k.add(body, G.box(0.12, 0.06, 0.2, 0.02), 'accent', [0, 0.12, 0.18]);
  k.add(body, G.cyl(0.01, 0.01, 0.3, 4), 'dark', [0.1, 0.3, -0.05]);
  const rotors: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62;
    k.add(body, G.box(0.5, 0.05, 0.08, 0.02), 'dark', [x / 2, 0.02, z / 2], [0, -a, 0]);
    k.add(body, G.torus(0.2, 0.025, 6, 20), 'hull', [x, 0.04, z], [Math.PI / 2, 0, 0]);
    const r = joint('rotor' + i, body, [x, 0.06, z]);
    k.add(r, G.box(0.36, 0.01, 0.05, 0.005), 'dark', [0, 0, 0]);
    rotors.push(r);
  }
  k.add(body, G.sph(0.035, 8, 6), 'navL', [-0.7, 0.04, 0]);
  k.add(body, G.sph(0.035, 8, 6), 'navR', [0.7, 0.04, 0]);
  k.build({ castShadow: true, receiveShadow: false });
  // fake volumetric beam: open cone, uv.y = 1 at the lamp, 0 at the ground
  const h = 1, geo = new THREE.CylinderGeometry(0.1, 1, h, 32, 1, true);
  geo.translate(0, -h / 2, 0);
  const beam = new THREE.Mesh(geo, beamMaterial(0xcfe6ff, 0.22));
  beam.renderOrder = 9; beam.frustumCulled = false; beam.userData.fx = true;
  root.add(beam);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== beam) o.userData.drone = true; });
  return { root, rotors, beam, lampY: -0.21, navL: mats.navL, navR: mats.navR, ring: mats.ring };
}
