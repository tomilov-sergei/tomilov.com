import * as THREE from './vendor/build/three.module.js';
// Port of setupMasks / StencilMasking in the saved main.built.js.
export async function createShowcaseMasks(renderer,scene,phone){
  const response=await fetch('reference/showcase/masks.json');
  if(!response.ok)throw new Error('Не найдена конфигурация масок');
  const configuration=await response.json(),materials=new Set(),targets=[];
  const meshes=names=>names.map(name=>{const mesh=phone.getObjectByName(name);if(!mesh?.isMesh)throw new Error(`Нет детали маски: ${name}`);return mesh;});
  configuration.forEach((group,bit)=>{
    for(const mesh of meshes(group.targets)){
      const m=mesh.material;materials.add(m);targets.push(mesh);
      Object.assign(m,{stencilFunc:THREE.AlwaysStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp,stencilFuncMask:1<<bit,stencilRef:1<<bit});
    }
    for(const mesh of meshes(group.footprints)){
      const m=mesh.material;materials.add(m);
      Object.assign(m,{stencilFunc:THREE.AlwaysStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.ZeroStencilOp,stencilZPass:THREE.ReplaceStencilOp,stencilWriteMask:1<<bit,stencilRef:255});
    }
    for(const mesh of meshes(group.blockers||[])){
      const m=mesh.material;materials.add(m);
      Object.assign(m,{stencilFunc:THREE.AlwaysStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.ReplaceStencilOp,stencilWriteMask:1<<bit,stencilRef:0});
    }
  });
  return {
    render(camera,enabled){
      for(const material of materials) material.stencilWrite=enabled;
      for(const mesh of targets) Object.assign(mesh.material,{colorWrite:!enabled,depthTest:true,polygonOffset:false,polygonOffsetUnits:0,stencilFunc:THREE.AlwaysStencilFunc});
      renderer.render(scene,camera);
      if(!enabled)return;
      const autoClear=renderer.autoClear;renderer.autoClear=false;
      try{
        for(const mesh of targets){
          Object.assign(mesh.material,{colorWrite:true,depthTest:true,polygonOffset:true,polygonOffsetUnits:-1e6,stencilFunc:THREE.EqualStencilFunc});
          renderer.render(mesh,camera);
        }
      }finally{
        renderer.autoClear=autoClear;
        // Keep diagnostic material clones free from the second-pass state.
        for(const mesh of targets) Object.assign(mesh.material,{colorWrite:true,polygonOffset:false,polygonOffsetUnits:0,stencilFunc:THREE.AlwaysStencilFunc});
        for(const material of materials)material.stencilWrite=false;
      }
    }
  };
}
