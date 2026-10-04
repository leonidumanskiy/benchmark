import * as THREE from 'three';

/** Fixed isometric-style camera: yaw 45°, elevation ~41.5°, orthographic. Screen-up maps to world (-1,0,-1). */
export const CAM_OFFSET = new THREE.Vector3(1, 1.25, 1).normalize().multiplyScalar(60);
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
