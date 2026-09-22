import * as THREE from './vendor/build/three.module.js';

export const lightPresets = [
  {id:'original',name:'Презентация',note:'Исходный свет меняется вместе с раскрытием и готовыми позами.',background:'#bbbbbb'},
  {id:'studio',name:'Белая студия',note:'Большие белые софтбоксы: широкие блики показывают плавность скруглений.',background:'#dedede',ambient:'#aaaaaa',cards:[['#ffffff',5,[-9,9,-6],[7,12]],['#ffffff',3,[8,4,1],[3,10]],['#ffffff',4,[0,-5,-10],[8,4]]]},
  {id:'warm',name:'Золотой час',note:'Тёплый ключевой свет и прохладное заполнение разделяют грани корпуса.',background:'#b9a18d',ambient:'#756453',cards:[['#ffd5a0',6,[-8,8,-7],[7,10]],['#a9cfff',3,[9,2,1],[4,9]],['#fff2dc',4,[0,-6,-8],[6,3]]]},
  {id:'red',name:'Красная студия',note:'Красные отражения окрашивают металл; белая полоса сохраняет читаемый контур.',background:'#38191e',dark:true,ambient:'#6b2230',cards:[['#ff294b',7,[-8,7,-3],[9,12]],['#ffffff',5,[7,6,-7],[2,11]],['#ff8d76',3,[1,-7,2],[7,7]]]},
  {id:'night',name:'Синий / розовый',note:'Узкие цветные источники рисуют противоположные кромки на тёмном фоне.',background:'#101a2b',dark:true,ambient:'#273354',cards:[['#499bff',9,[-7,7,-2],[3,12]],['#ff5bac',7,[8,3,0],[3,10]],['#e7f1ff',4,[0,-3,-10],[8,2]]]}
];

export function createStudioLighting(renderer){
  const pmrem=new THREE.PMREMGenerator(renderer),cache=new Map();
  let selected=lightPresets[0],strength=.5;
  // Mix toward equal-luminance neutral light in linear space, never repaint materials.
  function tint(value){
    const color=new THREE.Color(value),luma=color.r*.2126+color.g*.7152+color.b*.0722;
    return new THREE.Color().setRGB(luma,luma,luma).lerp(color,strength);
  }
  function texture(preset){
    const cached=cache.get(preset.id);
    if(cached?.strength===strength)return cached.target.texture;
    const room=new THREE.Scene();room.background=tint(preset.ambient);
    for(const [color,intensity,position,size] of preset.cards){
      const material=new THREE.MeshBasicMaterial({color:tint(color).multiplyScalar(intensity),side:THREE.DoubleSide,toneMapped:false});
      const card=new THREE.Mesh(new THREE.PlaneGeometry(...size),material);
      card.position.set(...position);card.lookAt(0,0,0);room.add(card);
    }
    const previous=renderer.getRenderTarget();let target;
    try{target=pmrem.fromScene(room,0,.1,100);}finally{
      renderer.setRenderTarget(previous);
      room.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    }
    cached?.target.dispose();
    cache.set(preset.id,{strength,target});return target.texture;
  }
  return {
    get selected(){return selected;},
    get strength(){return strength;},
    get background(){return '#'+tint(selected.background).getHexString();},
    setStrength(value){
      if(!Number.isFinite(value))return;
      strength=THREE.MathUtils.clamp(value,0,1);
    },
    select(id){
      const preset=lightPresets.find(p=>p.id===id);if(!preset)throw new Error('Unknown lighting preset');
      if(preset.cards)texture(preset);
      selected=preset;return preset;
    },
    // Temporary overrides: authored maps, exposure and animation remain intact.
    apply(scene,materials,enabled){
      if(!selected.cards){
        const saved=materials.map(material=>[material,material.envMapIntensity]);
        for(const [material,intensity] of saved)material.envMapIntensity=enabled?intensity*(.5+strength):0;
        return ()=>{for(const [material,intensity] of saved)material.envMapIntensity=intensity;};
      }
      const map=enabled?texture(selected):null;
      const saved=materials.map(material=>({material,map:material.envMap,rotation:material.envMapRotation.clone(),intensity:material.envMapIntensity}));
      const environment=scene.environment,rotation=scene.environmentRotation.clone();
      scene.environment=map;scene.environmentRotation.set(0,0,0);
      for(const {material} of saved){
        if(Boolean(material.envMap)!==Boolean(map))material.needsUpdate=true;
        material.envMap=map;material.envMapRotation.set(0,0,0);material.envMapIntensity=.5+strength;
      }
      return ()=>{
        scene.environment=environment;scene.environmentRotation.copy(rotation);
        for(const entry of saved){
          if(Boolean(entry.material.envMap)!==Boolean(entry.map))entry.material.needsUpdate=true;
          entry.material.envMap=entry.map;entry.material.envMapRotation.copy(entry.rotation);entry.material.envMapIntensity=entry.intensity;
        }
      };
    }
  };
}
