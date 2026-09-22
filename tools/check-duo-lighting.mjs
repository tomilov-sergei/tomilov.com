import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('../research/iphone-duo/viewer/',import.meta.url));
const THREE=await import(pathToFileURL(base+'vendor/build/three.module.js'));
let source=fs.readFileSync(base+'studio-lighting.js','utf8').replace("'./vendor/build/three.module.js'",JSON.stringify(pathToFileURL(base+'vendor/build/three.module.js').href));
source=source.replace('new THREE.PMREMGenerator(renderer)','({fromScene:()=>({texture:new THREE.Texture()})})');
const {createStudioLighting}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const studio=createStudioLighting({getRenderTarget:()=>null,setRenderTarget(){}});
const scene=new THREE.Scene(),original=new THREE.Texture();scene.environment=original;scene.environmentRotation.set(.2,.3,.4);
const m=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.24,metalness:.9});m.envMap=original;m.envMapRotation.set(.1,.5,.8);m.envMapIntensity=2;
const rotation=m.envMapRotation.clone();
for(const id of ['studio','warm','red','night']){
 studio.select(id);const restore=studio.apply(scene,[m],true);
 assert.notEqual(m.envMap,original);const cached=m.envMap;assert.equal(scene.environment,cached);assert.equal(m.roughness,.24);assert.equal(m.metalness,.9);
 restore();assert.equal(m.envMap,original);assert(m.envMapRotation.equals(rotation));assert.equal(m.envMapIntensity,2);assert.equal(scene.environment,original);
 studio.select(id);const restore2=studio.apply(scene,[m],true);assert.equal(m.envMap,cached);restore2();
 const restore3=studio.apply(scene,[m],false);assert.equal(m.envMap,null);assert.equal(scene.environment,null);restore3();assert.equal(m.envMap,original);
}
studio.select('original');studio.apply(scene,[m],true)();assert.equal(m.envMap,original);
console.log('PASS: four presets, exact environment/rotation/intensity restoration, material preservation, cache reuse, IBL off and original fallback.');
