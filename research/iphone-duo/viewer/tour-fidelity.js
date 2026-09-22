import * as THREE from './vendor/build/three.module.js';
import {CameraHandoff} from './camera-handoff.js';

import {tourLabels as labels, tourState, sampleTour, mergeVariant} from './showcase-state.js';
export function tourInterval(fold) {
  const f = THREE.MathUtils.clamp(fold, 0, 1);
  return f <= 1/3 ? [0, f*3] : [1, (f-1/3)*1.5];
}
const read = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
};
const modelRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.5708, 3.1416, 0, 'YXZ'));
export const worldToModel = modelRotation.clone().invert();

function indexScene(root) {
  const index = new Map();
  root.traverse(node => {
    index.set(node.name, node);
    if (node.isMesh) for (const m of [].concat(node.material)) index.set(m.name, m);
  });
  return index;
}
function property(object, key, value) {
  const match = /^(position|rotation|scale)(X|Y|Z)$/.exec(key);
  if (match) object[match[1]][match[2].toLowerCase()] = value;
  else if (/^(color|emissive)[RGB]$/.test(key)) {
    const name = key.startsWith('color') ? 'color' : 'emissive';
    object[name][key.slice(-1).toLowerCase()] = value;
  } else if (['emissiveIntensity','metalness','opacity','roughness','fov'].includes(key)) object[key] = value;
}
function apply(index, states, weights) {
  for (const [name, values] of Object.entries(states[0])) {
    if (name === '@states') continue;
    const object = index.get(name);
    if (!object) continue;
    for (const [key, value] of Object.entries(values))
      property(object,key,states.reduce((sum,state,i)=>sum+(state[name]?.[key] ?? value)*weights[i],0));
  }
}

export async function createReflectionTour({renderer, loader, phone, definitions, pmrem}) {
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2));
  quadScene.add(quad);
  const groups = [];
  const assets = [
    'models/env_b/lxfmQjvBiFmqVSB.gltf',
    'models/env_c/HIBNFTIRMmbKPzu.gltf',
    'models/env_a/aPBhICIQRrndUTh.gltf'];
  // These are emissive reflection cards, not the phone's UI plates.
  for (let layer=0; layer<3; layer++) {
    const [gltf, variants] = await Promise.all([
      loader.loadAsync(assets[layer]), read(`reference/env-${layer}.json`)]);
    const root = gltf.scene, index = indexScene(root);
    const states = labels.map(label => {
      const state = variants.find(v => v['@states'].includes(label));
      if (!state) throw new Error(`Нет отражений ${label}, слой ${layer}`);
      return state;
    });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);
    const orientation = new THREE.Group();
    orientation.quaternion.copy(worldToModel);
    orientation.add(root); scene.add(orientation);
    const materials = new Set();
    phone.traverse(node => {
      if (node.isMesh) for (const material of [].concat(node.material))
        if (definitions.get(material.name)?.layer === layer) materials.add(material);
    });
    const group = {layer, scene, index, states, materials:[...materials], maps:[], target:null};
    if (layer < 2) {
      // Bake on first use; switching back reuses the original endpoint map.
      apply(index,states,[1,...Array(labels.length-1).fill(0)]);
      scene.updateMatrixWorld(true);
      group.maps[0]=pmrem.fromScene(scene,0,3,2000);
      const first = group.maps[0];
      group.target = new THREE.WebGLRenderTarget(first.width, first.height, {
        type:THREE.HalfFloatType, depthBuffer:false,
        minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
      group.target.texture.mapping = THREE.CubeUVReflectionMapping;
      group.blendMaterial = new THREE.ShaderMaterial({
        depthTest:false, depthWrite:false, toneMapped:false,
        uniforms:{maps:{value:[]},weights:{value:[]}},
        vertexShader:'varying vec2 texUv; void main(){texUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader:`uniform sampler2D maps[${labels.length}]; uniform float weights[${labels.length}]; varying vec2 texUv; void main(){gl_FragColor=vec4(0.);${labels.map((_,i)=>`gl_FragColor+=texture2D(maps[${i}],texUv)*weights[${i}];`).join('')}}`
      });
    }
    groups.push(group);
  }
  let lastRevision = -1, lastEnabled = null;
  return {
    update(fold, enabled) {
      if (tourState.revision === lastRevision && enabled === lastEnabled) return;
      const savedTarget = renderer.getRenderTarget();
      try {
        for (const group of groups) {
          if (tourState.revision !== lastRevision) {
            if (group.layer === 2) {
              apply(group.index,group.states,tourState.weights);
              group.scene.updateMatrixWorld(true);
              const previous = group.target;
              group.target = pmrem.fromScene(group.scene,0,3,2000);
              previous?.dispose();
            } else {
              const u = group.blendMaterial.uniforms;
              for(let i=0;i<labels.length;i++) if(tourState.weights[i]>0 && !group.maps[i]) {
                apply(group.index,group.states,labels.map((_,j)=>i===j?1:0));
                group.scene.updateMatrixWorld(true);
                group.maps[i]=pmrem.fromScene(group.scene,0,3,2000);
              }
              u.maps.value=labels.map((_,i)=>(group.maps[i] ?? group.maps[0]).texture);
              u.weights.value=tourState.weights;
              quad.material=group.blendMaterial;
              renderer.setRenderTarget(group.target);renderer.render(quadScene,quadCamera);
            }
          }
          for (const material of group.materials) {
            const texture = enabled ? group.target.texture : null;
            if (material.envMap !== texture) {
              const programChange = Boolean(material.envMap) !== Boolean(texture);
              material.envMap=texture;
              if (programChange) material.needsUpdate=true;
            }
            material.envMapRotation.set(0,0,0);
            material.envMapIntensity=1;
          }
        }
      } finally { renderer.setRenderTarget(savedTarget); }
      lastRevision=tourState.revision;lastEnabled=enabled;
    }
  };
}

// Reconstruct the authored hierarchy, including each node's Euler order.
export async function createTourCamera(camera, controls, inset, poseRoot) {
  const [variants, modelVariants, rigData, manifest] = await Promise.all([
    read('reference/ODTNJCwCikFLGgN.json'), read('reference/JcvKFcEkqQvxADI.json'),
    read('reference/cwDtHJuxXgkrfwd.json'), read('scene_L_avif.lsd.json')]);
  const cameraStates=labels.map(label=>mergeVariant(variants,label));
  const modelStates=labels.map(label=>mergeVariant(modelVariants,label));
  const nodes=new Map();
  function collect(node){nodes.set(node.name,node);for(const child of node.children||[])collect(child);}
  collect(rigData);for(const node of manifest.children) collect(node);
  function matrix(name,states){
    const node=nodes.get(name), values=states.map(s=>s[name]||{});
    const vector=(key,defaults)=>['X','Y','Z'].map((axis,i)=>sampleTour(values.map(v=>v[key+axis]??defaults[i])));
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...vector('position',node.position||[0,0,0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...vector('rotation',node.rotation||[0,0,0]),node.rotationOrder||'XYZ')),
      new THREE.Vector3(...vector('scale',node.scale||[1,1,1])));
  }
  const basis=new THREE.Matrix4().makeRotationFromQuaternion(worldToModel);
  function updateModel(){
    const transform=basis.clone();
    for(const name of ['JcvKFcEkqQvxADI','STnuGAXDodXhJMb','MBakxdQZGJCEMAv']) transform.multiply(matrix(name,modelStates));
    transform.decompose(poseRoot.position,poseRoot.quaternion,poseRoot.scale);
    poseRoot.updateMatrixWorld(true);
  }
  const destination=camera.clone(), destinationTarget=new THREE.Vector3();
  const handoff=new CameraHandoff(camera,controls);
  function updateCamera(_fold,dt=0){
    // Lotus uses each component's explicit parent, not the reference's nesting.
    // bqjgz has parent:null; the surrounding Mcs group is not its parent.
    const transform=basis.clone();
    for(const name of ['bqjgzNBcRsbXpui','JVDwnioPKJgvCwW','JpSUNQDozMfDblA','ICfPxMhCLeZvhMl','gwBqaRPWYtbhjSA']) transform.multiply(matrix(name,cameraStates));
    transform.decompose(destination.position,destination.quaternion,new THREE.Vector3());
    destination.up.set(0,1,0).applyQuaternion(destination.quaternion);
    // Keep OrbitControls' target on this exact optical axis, including camera translation.
    const distance=sampleTour(cameraStates.map(s=>s.ICfPxMhCLeZvhMl.positionZ));
    destinationTarget.copy(destination.position).add(new THREE.Vector3(0,0,-distance).applyQuaternion(destination.quaternion));
    destination.fov=sampleTour(cameraStates.map(s=>s.gwBqaRPWYtbhjSA.fov));
    destination.near=nodes.get('gwBqaRPWYtbhjSA').near;destination.far=nodes.get('gwBqaRPWYtbhjSA').far;
    const {left,top,width,height}=inset();
    destination.zoom=Math.min(1,width/(height*1.05));
    destination.setViewOffset(width,height,-left,-top,innerWidth,innerHeight);
    destination.updateProjectionMatrix();
    handoff.apply(destination,destinationTarget,dt);
  }
  updateCamera.updateModel=updateModel;
  updateCamera.begin=()=>handoff.begin();
  updateCamera.cancel=()=>handoff.cancel();
  updateCamera.step=dt=>{if(handoff.active)updateCamera(undefined,dt);};
  return updateCamera;
}
