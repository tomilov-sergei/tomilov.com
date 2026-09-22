import * as THREE from './vendor/build/three.module.js';
import {TourSpring} from './tour-spring.js';

// Viewer handoff: use the source main-mixer spring, but retain OrbitControls
// as the interactive camera. This is not a port of Lotus InteractiveCamera.
export class CameraHandoff {
  constructor(camera,controls){
    this.camera=camera;this.controls=controls;
    this.spring=new TourSpring({stiffness:12,damping:.9});
    this.active=false;
  }
  begin(){
    if(this.active)return;
    this.from=this.camera.clone();this.fromTarget=this.controls.target.clone();
    this.value=0;this.velocity=0;this.active=true;
    // Drain OrbitControls' residual motion without moving the displayed frame.
    const damping=this.controls.enableDamping;
    this.controls.enableDamping=false;this.controls.update();
    this.controls.enableDamping=damping;
    this.camera.copy(this.from);this.controls.target.copy(this.fromTarget);
  }
  cancel(){this.active=false;}
  apply(destination,target,dt=0){
    const camera=this.camera;
    if(!this.active){camera.copy(destination);this.controls.target.copy(target);return;}
    const next=this.spring.update(this.value,1,this.velocity,dt);
    this.value=next.value;this.velocity=next.velocity;
    const t=THREE.MathUtils.clamp(this.value,0,1);
    // A quaternion follows the shortest rotation and remains stable at poles.
    camera.quaternion.slerpQuaternions(this.from.quaternion,destination.quaternion,t);
    camera.up.set(0,1,0).applyQuaternion(camera.quaternion);
    // Keep the interactive target on the displayed optical axis during handoff.
    const distance=THREE.MathUtils.lerp(this.from.position.distanceTo(this.fromTarget),destination.position.distanceTo(target),t);
    this.controls.target.lerpVectors(this.fromTarget,target,t);
    camera.position.set(0,0,distance).applyQuaternion(camera.quaternion).add(this.controls.target);
    for(const key of ['fov','zoom','near','far','aspect'])camera[key]=THREE.MathUtils.lerp(this.from[key],destination[key],t);
    // Both modes reserve the same inspector area. Resize follows the live target.
    camera.view=destination.view?{...destination.view}:null;
    camera.updateProjectionMatrix();
    if(!next.updated){this.active=false;camera.copy(destination);this.controls.target.copy(target);}
  }
}
