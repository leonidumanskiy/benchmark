// Turntable contact sheet: renders a model at 8 yaw angles relative to the game camera,
// as a close-up row and a row at exact in-game pixel scale. Used for asset review / evidence.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CAM_OFFSET, VIEW_HALF_HEIGHT } from './iso';

export interface TurntableOpts {
  cell?: number; // px per close-up cell
  closeHalf?: number; // ortho half-height of the close-up camera (world units)
  gameHeightPx?: number; // canvas height the game-scale row emulates
  center?: number; // model centre height
  pose?: (obj: THREE.Object3D, angleIndex: number) => void;
  lighting?: 'test' | 'none';
  /** subset of angle indices (0..7) to render */
  only?: number[];
  /** analysis mode: flat magenta background, no floor (for silhouette metrics) */
  analysis?: boolean;
}

export function renderTurntable(renderer: THREE.WebGLRenderer, obj: THREE.Object3D, o: TurntableOpts = {}): string {
  const cell = o.cell ?? 220, closeHalf = o.closeHalf ?? 1.2, center = o.center ?? 0.9;
  const gameH = o.gameHeightPx ?? 720;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.analysis ? 0xff00ff : 0x24282e);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x30302a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2); sun.position.set(10, 20, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; if (!o.analysis) scene.add(floor);
  const holder = new THREE.Group(); holder.add(obj); scene.add(holder);
  const prevParent = obj.parent;

  // game-scale camera: same ortho scale as in game => model occupies the same pixel size
  const gamePxPerUnit = gameH / (2 * VIEW_HALF_HEIGHT);
  const gameCell = Math.round(cell * 0.5);
  const gameHalf = gameCell / gamePxPerUnit / 2;
  const mk = (half: number) => { const c = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 200); c.position.copy(CAM_OFFSET).add(new THREE.Vector3(0, center, 0)); c.lookAt(0, center, 0); return c; };
  const closeCam = mk(closeHalf), gameCam = mk(gameHalf);

  const idx = o.only ?? [0, 1, 2, 3, 4, 5, 6, 7];
  const W = cell * idx.length, H = cell + gameCell + 26;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  g.fillStyle = '#101317'; g.fillRect(0, 0, W, H);
  // render into the main canvas (so tone mapping + sRGB output match the game) and copy regions out
  const pr = renderer.getPixelRatio();
  const cv = renderer.domElement;
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  for (let n = 0; n < idx.length; n++) {
    const i = idx[n];
    const simAngle = Math.PI / 4 + (i * Math.PI) / 4;
    obj.rotation.set(0, -simAngle, 0);
    o.pose?.(obj, i);
    for (const [cam, size, y] of [[closeCam, cell, 0], [gameCam, gameCell, cell + 26]] as const) {
      renderer.setViewport(0, 0, size, size); renderer.setScissor(0, 0, size, size);
      renderer.render(scene, cam);
      g.drawImage(cv, 0, cv.height - size * pr, size * pr, size * pr, n * cell + (cell - size) / 2, y, size, size);
    }
    g.fillStyle = '#8fb3c9'; g.font = '12px Consolas, monospace';
    g.fillText(['front', 'front-L', 'left', 'back-L', 'back', 'back-R', 'right', 'front-R'][i] + ` ${Math.round(i * 45)}°`, n * cell + 6, cell + 16);
  }
  renderer.setScissorTest(false);
  const sz = renderer.getSize(new THREE.Vector2());
  renderer.setViewport(0, 0, sz.x, sz.y);
  pmrem.dispose();
  holder.remove(obj); if (prevParent) prevParent.add(obj);
  return out.toDataURL('image/png');
}
