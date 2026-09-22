
#include <common>
uniform bool enableFraming;

#define BORDER_RADIUS 110.0

float fill(float sdf, float aa) {
  return smoothstep(0.0, aa, -sdf);
}

float sdRoundedBox(in vec2 p, in vec2 b, in float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
