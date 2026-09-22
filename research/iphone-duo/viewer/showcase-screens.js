import * as THREE from './vendor/build/three.module.js';
const read=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`Missing ${path}`);return r.json();};
export async function createShowcaseScreens(){
  const [assets,ao,lookup]=await Promise.all([read('reference/showcase/index.json'),read('reference/ao/index.json'),read('reference/showcase/EXzFOchljvdnHgB.json')]);
  const loader=new THREE.TextureLoader(),textures=new Map();
  const black=ao.find(a=>a.id==='chXcmJILZBdVbSF');
  await Promise.all([...assets.filter(a=>a.type==='texture').map(a=>({...a,dir:'showcase'})),{...black,dir:'ao'}].map(async asset=>{
    const texture=await loader.loadAsync(`reference/${asset.dir}/${asset.file}`);
    texture.flipY=asset.properties.flipY??true;
    texture.colorSpace=asset.properties.colorSpace??THREE.SRGBColorSpace;
    texture.anisotropy=asset.properties.anisotropy??1;
    // FadeThroughBlack.staticScreensFlipVertical, applied before FramePass.
    texture.offset.y=1;texture.repeat.y=-1;texture.needsUpdate=true;
    textures.set(asset.id,texture);
  }));
  let current=null, requested=null, value=1, from=1, to=1, elapsed=.38, revision=0;
  function target(next){if(to===next)return;from=value;to=next;elapsed=0;}
  return {
    update(label,dt){
      requested=label;
      if(current!==requested) target(-.01);
      else if(to===-.01) target(1);
      elapsed=Math.min(.38,elapsed+Math.max(0,dt));value=THREE.MathUtils.lerp(from,to,elapsed/.38);
      if(current!==requested && value<0){current=requested;revision++;target(1);}
    },
    reset(){current=requested=null;value=from=to=1;elapsed=.38;revision++;},
    texture(key){if(!current)return null;const id=lookup[current][key==='inner'?0:1];return textures.get(id);},
    get intensity(){return THREE.MathUtils.smoothstep(Math.max(0,Math.min(1,value))**1.3,0,.8);},
    get revision(){return revision;},
    get isStatic(){return current!==null;}
  };
}
