import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.82, 0.3).normalize();
export const FOG_COLOR = 0xd0ac7c;

export function createAtmosphere(scene, renderer) {
  // Bright desert dusk — one draw, procedural gradient + sun bloom.
  const uniforms = {
    topColor: { value: new THREE.Color('#6f9ab7') },
    midColor: { value: new THREE.Color('#d6b081') },
    horizonColor: { value: new THREE.Color('#e6c08c') },
    sunColor: { value: new THREE.Color('#fff0cc') },
    sunDir: { value: SUN_DIR.clone() },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vDir;

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.24, h));
        col = mix(col, topColor, smoothstep(0.2, 0.72, h));

        float band = smoothstep(0.16, 0.015, abs(h - 0.035));
        col = mix(col, horizonColor * 1.03, band * 0.45);
        col = mix(col, horizonColor * 0.94, smoothstep(0.02, -0.18, h) * 0.55);

        float sd = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(sd, 420.0) * 3.0;
        col += sunColor * pow(sd, 12.0) * 0.2;
        col += sunColor * pow(sd, 3.0) * 0.05;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xa9c6d8, 0xb07f53, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe0ae, 4.0);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun.target);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8fb0c2, 0.25);
  fill.position.set(28, 18, 34);
  scene.add(fill);

  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.008);
  renderer.setClearColor(FOG_COLOR, 1);

  function setShadowQuality(enabled, size = 1024) {
    renderer.shadowMap.enabled = enabled;
    sun.castShadow = enabled;
    if (enabled && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    renderer.shadowMap.needsUpdate = true;
  }

  return { sky, sun, hemi, fill, skyMat, setShadowQuality };
}

