// Post-processing: HDR scene -> bloom (only bright emissive/additive content) -> tone mapping/sRGB output.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  enabled = true;
  renderPass: RenderPass;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.3, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  setCamera(camera: THREE.Camera) { this.renderPass.camera = camera; }
  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.enabled) this.composer.render(); else this.renderer.render(scene, camera);
  }
}
