import * as THREE from './vendor/build/three.module.js';
import {tourLabels, tourState, sampleTour, mergeVariant} from './showcase-state.js';

export async function createScreenTour(screens) {
  const response = await fetch('reference/MBakxdQZGJCEMAv.json');
  if (!response.ok) throw new Error('Не найдены варианты экранов');
  const variants = await response.json();
  // Multiple blocks can contribute properties to the same state/material.
  const states = tourLabels.map(label=>mergeVariant(variants,label));
  return () => {
    for (const screen of screens) {
      const name = `${screen.wipe.mat.name}:Wipe`;
      screen.brightness = sampleTour(states.map(state=>state[name]?.brightness ?? 1));
    }
  };
}

// Lotus mixes texture samples and aoMapIntensity independently. Keep a stable
// render target per animated material so debug views see the same live map.
export async function createAoTour({renderer, phone, definitions, states}) {
  const response = await fetch('reference/ao/index.json');
  if (!response.ok) throw new Error('Не найден индекс AO-карт');
  const assets = await response.json();
  const loader = new THREE.TextureLoader();
  const textures = new Map(await Promise.all(assets.map(async asset => {
    const texture = await loader.loadAsync(`reference/ao/${asset.file}`);
    texture.name = asset.id;
    texture.flipY = asset.properties.flipY ?? true;
    texture.channel = asset.properties.channel ?? 0;
    texture.colorSpace = asset.properties.colorSpace ?? THREE.SRGBColorSpace;
    return [asset.id, texture];
  })));
  const materials = new Set();
  phone.traverse(node => {
    if (node.isMesh) for (const material of [].concat(node.material)) materials.add(material);
  });
  const entries = [];
  for (const material of materials) {
    const base = definitions.get(material.name)?.chunks?.AoMap;
    if (!base) continue;
    const values = states.map(state => ({...base, ...state[`${material.name}:AoMap`]}));
    const maps = values.map(value => {
      const texture = textures.get(value.aoMap);
      if (!texture) throw new Error(`Не найдена AO-карта ${value.aoMap}`);
      return texture;
    });
    const animated = maps.some(map => map !== maps[0]);
    let target = null;
    if (animated) {
      if (maps.some(map => map.channel !== maps[0].channel))
        throw new Error(`Разные UV-каналы AO: ${material.name}`);
      target = new THREE.WebGLRenderTarget(
        Math.max(...maps.map(map => map.image.width)),
        Math.max(...maps.map(map => map.image.height)), {
          depthBuffer:false, type:THREE.HalfFloatType,
          minFilter:THREE.LinearMipmapLinearFilter, magFilter:THREE.LinearFilter,
          generateMipmaps:true});
      target.texture.name = `${material.name}:AO blend`;
      target.texture.channel = maps[0].channel;
    }
    material.aoMap = target?.texture ?? maps[0];
    material.needsUpdate = true;
    entries.push({material, values, maps, target});
  }
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const blend = new THREE.ShaderMaterial({
    depthTest:false, depthWrite:false, toneMapped:false,
    uniforms:{maps:{value:[]}, weights:{value:[]}},
    vertexShader:'varying vec2 texUv; void main(){texUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D maps[${tourLabels.length}]; uniform float weights[${tourLabels.length}]; varying vec2 texUv; void main(){gl_FragColor=vec4(0.);${tourLabels.map((_,i)=>`gl_FragColor+=texture2D(maps[${i}],texUv)*weights[${i}];`).join('')}}`
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), blend));
  let previous = -1;
  return {
    count:entries.length,
    animatedCount:entries.filter(entry => entry.target).length,
    update(fold) {
      if (tourState.revision === previous) return;
      const savedTarget = renderer.getRenderTarget();
      try {
        for (const entry of entries) {
          entry.material.aoMapIntensity = sampleTour(entry.values.map(value=>value.aoMapIntensity));
          if (!entry.target) continue;
          blend.uniforms.maps.value = entry.maps;
          blend.uniforms.weights.value = tourState.weights;
          renderer.setRenderTarget(entry.target);
          renderer.render(scene,camera);
        }
      } finally { renderer.setRenderTarget(savedTarget); }
      previous = tourState.revision;
    }
  };
}
