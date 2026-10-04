// Shared PBR material library. Palette lives in the specs; this maps palette entries to materials.
import * as THREE from 'three';
import { metalPanels, stoneBlocks, rockTexture, chitinTexture } from './textures';

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

export function withPanels(color: string | number, rough = 0.45, metal = 0.6, repeat = 1, seed = 3, normalScale = 0.6) {
  const t = metalPanels(seed);
  const m = std({ color, roughness: rough, metalness: metal, normalMap: t.normalMap, roughnessMap: t.roughnessMap });
  m.normalScale.set(normalScale, normalScale);
  if (repeat !== 1) {
    // per-material repeat without touching the shared texture
    m.normalMap = t.normalMap.clone(); m.normalMap.repeat.set(repeat, repeat); m.normalMap.needsUpdate = true;
    m.roughnessMap = t.roughnessMap.clone(); m.roughnessMap.repeat.set(repeat, repeat); m.roughnessMap.needsUpdate = true;
  }
  return m;
}

export const glow = (color: string | number, intensity = 2.5) => std({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

let envMats: Record<string, THREE.Material> | null = null;
/** Environment materials (shared by all props). */
export function envMaterials() {
  if (envMats) return envMats;
  const metal = metalPanels(3, '#8d949e', 4);
  const metal2 = metalPanels(17, '#8a7a66', 3);
  const stone = stoneBlocks(5);
  const rock = rockTexture(9);
  envMats = {
    panel: std({ ...metal, color: 0x9aa3ad, roughness: 0.6, metalness: 0.35 }),
    panelDark: std({ ...metal, color: 0x5d646d, roughness: 0.65, metalness: 0.35 }),
    panelRust: std({ ...metal2, color: 0x9a8f86, roughness: 0.7, metalness: 0.5 }),
    trim: std({ color: 0x2a2e34, roughness: 0.55, metalness: 0.5 }),
    hazard: std({ color: 0xd19a1e, roughness: 0.6, metalness: 0.2 }),
    hazardDark: std({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.2 }),
    stone: std({ ...stone, color: 0xc8c0b4, roughness: 0.95, metalness: 0 }),
    stoneDark: std({ ...stone, color: 0x8a837a, roughness: 0.95, metalness: 0 }),
    concrete: std({ ...stone, color: 0xa39f98, roughness: 0.9, metalness: 0 }),
    rock: std({ ...rock, color: 0xb0a596, roughness: 0.92, metalness: 0, flatShading: false }),
    rebar: std({ color: 0x5a3a2a, roughness: 0.8, metalness: 0.6 }),
    cable: std({ color: 0x15161a, roughness: 0.6, metalness: 0.1 }),
    lampCyan: glow(0x39d6ff, 3),
    lampRed: glow(0xff2a1a, 3.5),
    lampAmber: glow(0xffa630, 3),
    screen: glow(0x2fe0c0, 1.6),
    hive: std({ color: 0x1e0b12, roughness: 0.5, metalness: 0.05, emissive: 0x30040e, emissiveIntensity: 0.3, flatShading: true }),
    hiveGlow: glow(0xff3048, 2.2),
    leafRed: std({ color: 0x8c1a2c, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, emissive: 0x2a0008, emissiveIntensity: 0.5 }),
    leafDark: std({ color: 0x2d3a2a, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    leafTeal: std({ color: 0x1b4a4a, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, emissive: 0x03211f, emissiveIntensity: 0.6 }),
    stalk: std({ color: 0x3b2a2a, roughness: 0.7 }),
    bulb: glow(0x5af0ff, 2.2),
    bulbPink: glow(0xff4fa0, 2.2),
    shroomCap: std({ color: 0x264a5a, roughness: 0.5, emissive: 0x18c8ff, emissiveIntensity: 0.55 }),
    moss: std({ color: 0x2f3a24, roughness: 1 }),
    grass: std({ color: 0x4a5236, roughness: 0.9, side: THREE.DoubleSide }),
  };
  return envMats;
}

export function chitinMaterials(palette: { shell: string; shellDark: string; flesh: string; glow: string; spike: string; eye: string }) {
  const c = chitinTexture(13);
  const nScale = new THREE.Vector2(0.35, 0.35);
  return {
    shell: std({ map: c.map, normalMap: c.normalMap, roughnessMap: c.roughnessMap, color: palette.shell, roughness: 0.5, metalness: 0.2, flatShading: true, envMapIntensity: 0.35 }),
    shellDark: std({ map: c.map, normalMap: c.normalMap, color: palette.shellDark, roughness: 0.6, metalness: 0.2, flatShading: true, envMapIntensity: 0.35 }),
    flesh: std({ color: palette.flesh, roughness: 0.45, metalness: 0.05, emissive: palette.flesh, emissiveIntensity: 0.25 }),
    glow: glow(palette.glow, 2.4),
    spike: std({ color: palette.spike, roughness: 0.35, metalness: 0.3, emissive: palette.spike, emissiveIntensity: 0.35 }),
    eye: glow(palette.eye, 4),
    teeth: std({ color: 0xd8d0c0, roughness: 0.4 }),
  };
}

export { rockTexture };
