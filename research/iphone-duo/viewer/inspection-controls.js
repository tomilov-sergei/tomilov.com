import {EventDispatcher, Vector3, Quaternion, MathUtils} from './vendor/build/three.module.js';

// Screen-relative inspection: keep the authored camera orientation on takeover.
// Rotate the camera and its optical target around the visible model, never a world pole.
export class InspectionControls extends EventDispatcher {
  constructor(camera, element, getBounds, getFrame) {
    super(); Object.assign(this,{camera,element,getBounds,getFrame});
    this.target=new Vector3(); this.minDistance=2; this.mode='rotate';
    this.points=new Map(); element.style.touchAction='none'; element.style.cursor='grab';
    element.addEventListener('contextmenu',e=>e.preventDefault());
    element.addEventListener('pointerdown',e=>{
      if(e.button>2)return;
      e.preventDefault(); element.setPointerCapture(e.pointerId);
      if(!this.points.size)this.begin();
      this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      element.style.cursor='grabbing';
    });
    element.addEventListener('pointermove',e=>{
      const old=this.points.get(e.pointerId); if(!old)return;
      const before=[...this.points.values()].map(p=>({...p}));
      this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const after=[...this.points.values()];
      if(after.length===2){
        const distance=p=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        const a=distance(before),b=distance(after);
        if(a>8&&b>8)this.dolly(a/b);
        this.pan((after[0].x+after[1].x-before[0].x-before[1].x)/2,
          (after[0].y+after[1].y-before[0].y-before[1].y)/2);
      }else if(after.length===1){
        const dx=e.clientX-old.x,dy=e.clientY-old.y;
        if(this.mode==='pan'||e.shiftKey||(e.buttons&2))this.pan(dx,dy);
        else if(e.buttons&4)this.dolly(Math.exp(dy*.008));
        else this.rotate(dx,dy);
      }
    });
    const end=e=>{
      this.points.delete(e.pointerId);
      if(!this.points.size){element.style.cursor=this.mode==='pan'?'move':'grab';this.dispatchEvent({type:'end'});}
    };
    for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,end);
    element.addEventListener('wheel',e=>{
      e.preventDefault(); this.begin();
      const unit=e.deltaMode===1?16:e.deltaMode===2?this.getFrame().height:1;
      // One gesture, one meaning: scroll/pinch zoom; Shift+scroll explicitly pans.
      if(e.shiftKey&&!e.ctrlKey)this.pan(-e.deltaX*unit,-e.deltaY*unit);
      else this.dolly(Math.exp(MathUtils.clamp(e.deltaY*unit*(e.ctrlKey?.008:.002),-.25,.25)));
      this.dispatchEvent({type:'end'});
    },{passive:false});
  }
  begin(){
    this.dispatchEvent({type:'start'});
    const {center,radius}=this.getBounds();this.pivot=center;this.radius=Math.max(radius,.1);
  }
  update(){} // Authored poses own their orientation; there is no residual inertia.
  rotate(dx,dy){
    const scale=Math.PI/Math.max(180,this.getFrame().height);
    const axis=new Vector3(-dy,-dx,0);const length=axis.length();if(!length)return;
    axis.normalize().applyQuaternion(this.camera.quaternion);
    const q=new Quaternion().setFromAxisAngle(axis,length*scale);
    this.camera.position.sub(this.pivot).applyQuaternion(q).add(this.pivot);
    this.target.sub(this.pivot).applyQuaternion(q).add(this.pivot);
    this.camera.quaternion.premultiply(q).normalize();
    this.camera.up.set(0,1,0).applyQuaternion(this.camera.quaternion);
  }
  pan(dx,dy){
    const c=this.camera;
    const scale=2*c.position.distanceTo(this.pivot)*Math.tan(MathUtils.degToRad(c.fov/2))/c.zoom/this.getFrame().height;
    const shift=new Vector3(-dx,dy,0).applyQuaternion(c.quaternion).multiplyScalar(scale);
    c.position.add(shift);this.target.add(shift);
  }
  dolly(factor){
    const c=this.camera,offset=c.position.clone().sub(this.pivot),distance=offset.length();
    const next=MathUtils.clamp(distance*factor,Math.max(this.radius*1.15,c.near+this.radius),this.radius*35);
    const shift=offset.multiplyScalar(next/Math.max(distance,.001)-1);
    c.position.add(shift);this.target.add(shift);
  }
  zoom(factor){this.begin();this.dolly(factor);this.dispatchEvent({type:'end'});}
}
