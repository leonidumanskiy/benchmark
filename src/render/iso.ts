import * as THREE from 'three';

/** Fixed isometric-style camera: yaw 45°, elevation ~41.5°, orthographic. Screen-up maps to world (-1,0,-1). */
export const CAM_OFFSET = new THREE.Vector3(1, 1.25, 1).normalize().multiplyScalar(60);
export const CAM_DIR = CAM_OFFSET.clone().normalize();
export const VIEW_HALF_HEIGHT = 8;
/** runtime zoom (debug/evidence only) */
export const zoom = { half: VIEW_HALF_HEIGHT };
/** Aim plane height: cursor rays are intersected with this horizontal plane (≈ torso / gun height). */
export const AIM_PLANE_Y = 0.9;

export function makeIsoCamera(aspect: number) {
  const h = VIEW_HALF_HEIGHT;
  const cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 1, 200);
  cam.position.copy(CAM_OFFSET);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function resizeIsoCamera(cam: THREE.OrthographicCamera, aspect: number) {
  const h = zoom.half;
  cam.left = -h * aspect; cam.right = h * aspect; cam.top = h; cam.bottom = -h;
  cam.updateProjectionMatrix();
}

// ------------------------------------------------------------------ weak perspective
// Same fixed yaw/elevation as the ortho camera, no rotation, long lens: the camera sits far back along CAM_DIR so
// that the view half-height at the focus point equals the ortho half-height. Reads as near-isometric, but
// parallel lines converge slightly and tall objects show their sides as they move across the screen.
export const PERSP_DEFAULT_FOV = 14; // vertical FOV in degrees (~98 mm full-frame equivalent)

/** Distance from the focus point that frames `half` metres of half-height at vertical FOV `fovDeg`. */
export function perspDistance(fovDeg: number, half = zoom.half) {
  return half / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
}

/** 35 mm full-frame equivalent focal length for a vertical FOV. */
export function focalLength35(fovDeg: number) {
  return 12 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
}

export function makePerspCamera(aspect: number, fovDeg = PERSP_DEFAULT_FOV) {
  const d = perspDistance(fovDeg);
  const cam = new THREE.PerspectiveCamera(fovDeg, aspect, Math.max(1, d - 60), d + 90);
  cam.position.copy(CAM_DIR).multiplyScalar(d);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function resizePerspCamera(cam: THREE.PerspectiveCamera, aspect: number, fovDeg = cam.fov) {
  const d = perspDistance(fovDeg);
  cam.fov = fovDeg; cam.aspect = aspect; cam.near = Math.max(1, d - 60); cam.far = d + 90;
  cam.updateProjectionMatrix();
}

/** Offset from the focus point to the camera for either mode. */
export function cameraOffset(cam: THREE.Camera) {
  return (cam as THREE.PerspectiveCamera).isPerspectiveCamera ? CAM_DIR.clone().multiplyScalar(perspDistance((cam as THREE.PerspectiveCamera).fov)) : CAM_OFFSET.clone();
}
