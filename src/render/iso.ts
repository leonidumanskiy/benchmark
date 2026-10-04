import * as THREE from 'three';

/** Fixed isometric-style camera: yaw 45°, elevation ~41.5°. Screen-up maps to world (-1,0,-1). */
export const CAM_OFFSET = new THREE.Vector3(1, 1.25, 1).normalize().multiplyScalar(60);
export const CAM_DIR = CAM_OFFSET.clone().normalize();
export const VIEW_HALF_HEIGHT = 8;
/** runtime zoom (debug/evidence only) */
export const zoom = { half: VIEW_HALF_HEIGHT };
/** Aim plane height: cursor rays are intersected with this horizontal plane (≈ torso / gun height). */
export const AIM_PLANE_Y = 0.9;

export type GameCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

export function makeIsoCamera(aspect: number) {
  const h = VIEW_HALF_HEIGHT;
  const cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 1, 200);
  cam.position.copy(CAM_OFFSET);
  cam.lookAt(0, 0, 0);
  return cam;
}

/** vertical FOV (deg) of a full-frame (24 mm tall) lens */
export const focalToFov = (mm: number) => (2 * Math.atan(12 / mm) * 180) / Math.PI;

/**
 * Weak-perspective camera: same fixed yaw/elevation as the iso view, long lens far away, framed so the
 * focus plane shows exactly the iso view's half-height => same on-screen scale at the player, mild depth cues.
 */
export function makePerspCamera(aspect: number, focalMm: number) {
  const cam = new THREE.PerspectiveCamera(focalToFov(focalMm), aspect, 1, 400);
  fitPersp(cam, aspect, focalMm);
  return cam;
}

/** distance from the focus point for the current zoom */
export function perspDistance(cam: THREE.PerspectiveCamera) {
  return zoom.half / Math.tan(((cam.fov / 2) * Math.PI) / 180);
}

export function fitPersp(cam: THREE.PerspectiveCamera, aspect: number, focalMm: number) {
  cam.fov = focalToFov(focalMm); cam.aspect = aspect;
  const d = perspDistance(cam);
  cam.near = Math.max(1, d - 60); cam.far = d + 80;
  cam.updateProjectionMatrix();
}

/** camera position offset from the focus point */
export function cameraOffset(cam: GameCamera, out = new THREE.Vector3()) {
  return (cam as THREE.PerspectiveCamera).isPerspectiveCamera ? out.copy(CAM_DIR).multiplyScalar(perspDistance(cam as THREE.PerspectiveCamera)) : out.copy(CAM_OFFSET);
}

export function resizeIsoCamera(cam: THREE.OrthographicCamera, aspect: number) {
  const h = zoom.half;
  cam.left = -h * aspect; cam.right = h * aspect; cam.top = h; cam.bottom = -h;
  cam.updateProjectionMatrix();
}
