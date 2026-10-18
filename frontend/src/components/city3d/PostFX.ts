import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Cinematic post-processing: MSAA HDR render -> (ambient occlusion) -> bloom -> tone mapping ->
 * colour grade (contrast, saturation, warmth, vignette).
 *   high   = ambient occlusion + bloom + grade (ambient occlusion re-renders the scene: most expensive)
 *   medium = bloom + grade (default)
 *   low    = no effects, rendered at 1x pixel ratio (still through the composer: on this ANGLE/D3D11
 *            setup a direct canvas render measured slower than the composer's off-screen MSAA target)
 */
export type GraphicsQuality = 'high' | 'medium' | 'low';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    contrast: { value: 1.07 },
    saturation: { value: 1.14 },
    warmth: { value: 0.03 },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, warmth, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(warmth, warmth * 0.35, -warmth * 0.6);
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export interface PostFX {
  render: () => void;
  setSize: (w: number, h: number) => void;
  setQuality: (q: GraphicsQuality) => void;
  setNight: (night: number) => void;   // 0 day .. 1 night (bloom strength)
  dispose: () => void;
}

export function readQuality(): GraphicsQuality {
  try {
    const v = window.localStorage.getItem('cityai.graphics');
    return v === 'high' || v === 'low' ? v : 'medium';
  } catch { return 'medium'; }
}

export function createPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): PostFX {
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const ao = new GTAOPass(scene, camera, w, h);
  ao.blendIntensity = 0.85;
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.22, 0.55, 0.9);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
  composer.addPass(ao);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);

  let quality: GraphicsQuality = readQuality();
  const size = new THREE.Vector2(w, h);
  const resize = () => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    ao.setSize(size.x, size.y);
  };
  const apply = () => {
    ao.enabled = quality === 'high';
    bloom.enabled = quality !== 'low';
    grade.enabled = quality !== 'low';
    const pixelRatio = quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2);
    if (renderer.getPixelRatio() !== pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(size.x, size.y, false);
      resize();
    }
  };
  apply();

  return {
    render: () => composer.render(),
    setSize: (nw, nh) => {
      size.set(nw, nh);
      resize();
    },
    setQuality: (q) => { quality = q; apply(); },
    setNight: (night) => {
      bloom.strength = 0.18 + 0.75 * night;
      bloom.threshold = 0.92 - 0.25 * night;
      (grade.uniforms as typeof GradeShader.uniforms).warmth.value = 0.03 * (1 - night);
    },
    dispose: () => {
      composer.dispose();
      ao.dispose();
      bloom.dispose();
      target.dispose();
    },
  };
}
