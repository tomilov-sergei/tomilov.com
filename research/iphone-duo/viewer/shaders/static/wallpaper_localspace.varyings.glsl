
uniform mat4 modelMatrixInverse;
varying vec3 vLocalPosition;
varying vec3 vLocalCameraPosition;
varying mat3 vRotationMatrixInverse;
uniform vec3 emissiveLocalPos;
uniform vec3 rotation;
varying vec3 p0;
varying vec3 p1;
varying vec3 p2;

#ifndef USE_TRANSMISSION
  varying vec3 vWorldPosition;
#endif

vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
  return mix(
    dot(axis, p) * axis,
    p,
    cos(angle)) +
    cross(axis, p) *
    sin(angle)
  ;
}
