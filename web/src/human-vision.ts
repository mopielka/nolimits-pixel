import * as THREE from 'three';

/**
 * Approximates what one person sees, applied after rendering a wide (~120°) perspective:
 *
 * - the visual field is an oval, wider than tall and reaching further down than up
 *   (cheeks and brows limit it above, the nose barely matters for both eyes together);
 * - acuity drops fast away from the centre, so the periphery is blurred – sharp in the
 *   central ~20°, soft by ~40°;
 * - colour sensitivity fades towards the edges, so the periphery desaturates;
 * - the edge of the field isn't a hard frame but fades into darkness.
 *
 * Also adds a mild barrel squeeze towards the edges so a wide field reads as one glance
 * rather than a stretched rectilinear panorama.
 */
export const HumanVisionShader = {
  name: 'HumanVisionShader',
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;

    // Field of view boundary as an ellipse in screen space, centre slightly above the middle
    // because people see further down than up.
    const vec2 FIELD_CENTRE = vec2(0.0, 0.06);
    const vec2 FIELD_RADIUS = vec2(0.98, 0.9);

    vec3 sampleBlurred(vec2 uv, float radiusPx) {
      if (radiusPx < 0.5) return texture2D(tDiffuse, uv).rgb;
      vec2 px = radiusPx / resolution;
      vec3 sum = texture2D(tDiffuse, uv).rgb * 0.2;
      // Two rings of a cheap golden-angle disc.
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 2.39996;
        float r = sqrt((float(i) + 0.5) / 16.0);
        sum += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r * px).rgb * 0.05;
      }
      return sum;
    }

    void main() {
      vec2 p = vUv * 2.0 - 1.0;

      // Mild barrel squeeze: content further from the centre is pulled in a little.
      vec2 uv = (p * (1.0 + 0.08 * dot(p, p))) * 0.5 + 0.5;

      // Distance from the centre of gaze: 0 at the fovea, about 1 at the side edges (~60°).
      float ecc = length(p * vec2(1.0, 0.8));

      float blur = smoothstep(0.18, 0.9, ecc) * 7.0;
      vec3 col = sampleBlurred(uv, blur);

      float grey = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(grey), smoothstep(0.35, 1.0, ecc) * 0.55);

      // Soft oval edge of the whole visual field.
      vec2 e = (p - FIELD_CENTRE) / FIELD_RADIUS;
      float field = 1.0 - smoothstep(0.72, 1.0, length(e));
      col *= field * (1.0 - 0.25 * smoothstep(0.4, 1.0, ecc));

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
