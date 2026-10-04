// Materials for pipeline-generated (Blender) assets. Geometry carries baked per-vertex data in COLOR_0:
// R = ambient occlusion, G = convex-edge mask, B = cavity mask, A = per-part random. This shader uses it for
// AO (direct + indirect), painted-edge wear, grime in crevices and subtle per-part tint variation.
// Colours/roughness live in the runtime spec palette, so recolouring never needs a Blender re-run.
import * as THREE from 'three';
import { noiseTile, heightToNormal } from '../textures';

export interface GenMatOpts {
  color: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** strength of baked AO on direct diffuse (indirect light always gets full AO) */
  ao?: number;
  /** edge wear amount and look */
  edge?: number; edgeColor?: THREE.ColorRepresentation; edgeRough?: number; edgeMetal?: number;
  cavity?: number;
  tint?: number;
  /** tiling micro-detail normal map strength (0 = none) */
  detail?: number;
  detailRepeat?: number;
  side?: THREE.Side;
  envMapIntensity?: number;
}

let detailTex: THREE.Texture | null = null;
function detailNormal() {
  if (detailTex) return detailTex;
  const n = heightToNormal(noiseTile(256, 77, 4), 2.0);
  detailTex = new THREE.CanvasTexture(n);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.colorSpace = THREE.NoColorSpace;
  detailTex.anisotropy = 4;
  return detailTex;
}

export function genMaterial(o: GenMatOpts): THREE.MeshStandardMaterial {
  const base = new THREE.Color(o.color);
  const m = new THREE.MeshStandardMaterial({
    color: base, roughness: o.roughness ?? 0.5, metalness: o.metalness ?? 0.3,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, side: o.side ?? THREE.FrontSide,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  if ((o.detail ?? 0) > 0) {
    const t = detailNormal().clone(); t.needsUpdate = true;
    const r = (o.detailRepeat ?? 1) * 5; t.repeat.set(r, r);
    m.normalMap = t; m.normalScale.set(o.detail!, o.detail!);
  }
  m.vertexColors = true;
  const hsl = { h: 0, s: 0, l: 0 }; base.getHSL(hsl);
  const edgeC = o.edgeColor !== undefined ? new THREE.Color(o.edgeColor) : new THREE.Color().setHSL(hsl.h, hsl.s * 0.5, Math.min(0.85, hsl.l * 1.9 + 0.12));
  const u = {
    uAO: { value: o.ao ?? 0.85 }, uEdge: { value: o.edge ?? 0.55 }, uEdgeColor: { value: edgeC },
    uEdgeRough: { value: o.edgeRough ?? 0.32 }, uEdgeMetal: { value: o.edgeMetal ?? 0.8 },
    uCavity: { value: o.cavity ?? 0.45 }, uTint: { value: o.tint ?? 0.18 },
  };
  m.userData.gen = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAO, uEdge, uEdgeRough, uEdgeMetal, uCavity, uTint; uniform vec3 uEdgeColor;')
      .replace('#include <color_fragment>', `
#if defined( USE_COLOR_ALPHA )
  vec4 gd = vColor;
#elif defined( USE_COLOR )
  vec4 gd = vec4( vColor, 0.5 );
#else
  vec4 gd = vec4( 1.0, 0.0, 0.0, 0.5 );
#endif
  float gAO = clamp( gd.r, 0.0, 1.0 );
  float gEdge = smoothstep( 0.15, 0.85, gd.g ) * uEdge;
  float gCav = clamp( gd.b, 0.0, 1.0 );
  diffuseColor.rgb *= mix( 1.0, gAO, uAO ) * ( 1.0 - gCav * uCavity ) * ( 1.0 + ( gd.a - 0.5 ) * uTint );
  diffuseColor.rgb = mix( diffuseColor.rgb, uEdgeColor, gEdge );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, uEdgeRough, gEdge ) + gCav * 0.2;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix( metalnessFactor, uEdgeMetal, gEdge );')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= gAO * gAO;\n  reflectedLight.indirectSpecular *= mix( 1.0, gAO, 0.85 );');
  };
  m.customProgramCacheKey = () => 'gen-v1';
  return m;
}

/** Emissive-only material for light strips, visors, eyes (no baked data needed). */
export function genGlow(color: THREE.ColorRepresentation, intensity = 2.5) {
  return new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
}

/**
 * Replace the placeholder materials exported from Blender with runtime materials looked up by slot name.
 * Unknown slots throw, so a renamed slot in a generator fails loudly instead of rendering grey.
 */
export function bindSlots(root: THREE.Object3D, mats: Record<string, THREE.Material>) {
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const pick = (m: THREE.Material) => {
      const slot = m.name.replace(/\.\d+$/, '');
      const r = mats[slot];
      if (!r) throw new Error(`gen asset: no runtime material for slot "${slot}"`);
      return r;
    };
    me.material = Array.isArray(me.material) ? me.material.map(pick) : pick(me.material);
    me.castShadow = true; me.receiveShadow = true;
  });
}
