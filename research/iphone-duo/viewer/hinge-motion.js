// Hinge simulation reconstructed from the saved Apple page's module
// ju1MucNkkwbyrNP8rxxT. Scheduling and DOM/ARIA are owned by the viewer.
export class HingeState {
  constructor(value=0){
    this.spring={mass:1,stiffness:(2*Math.PI/.75)**2,damping:(1-.15)*4*Math.PI/.75};
    this.magnets=[{origin:0,strength:30,radius:.08},{origin:1,strength:20,radius:.08}];
    this.frameTimeTarget=1/60;
    this.reset(value);
  }
  reset(value){
    this.currentState={position:value,target:value,velocity:0,
      stretchPosition:value,stretchTarget:value,stretchVelocity:0};
    this.previousState={...this.currentState};this.renderState={...this.currentState};
    this.magnetEngaging=this.magnetEngaged=this.magnetDisengaging=null;
    this.pointerDown=false;this.frameTimeAccumulator=0;
  }
  simulate(target,pointerDown){
    if(this.magnetEngaging===null || this.magnetEngaged===null)this.currentState.target=target;
    this.currentState.stretchTarget=target;this.pointerDown=pointerDown;
    if(!pointerDown){
      const magnet=this.magnetEngaging || this.magnetEngaged;
      if(magnet)this.currentState.target=this.currentState.stretchTarget=magnet.origin;
    }
  }
  inRadius(magnet,stretch=false){
    return Math.abs(this.renderState[stretch?'stretchPosition':'position']-magnet.origin)<=magnet.radius;
  }
  attached(magnet){
    return Math.sign(this.currentState.position-magnet.origin)!==this.attractionDirection || this.currentState.position===magnet.origin;
  }
  near(stretch=false){
    const s=this.currentState;
    return stretch ? Math.abs(s.stretchPosition-s.stretchTarget)<1e-5 && Math.abs(s.stretchVelocity)<1e-5
      : Math.abs(s.position-s.target)<1e-5 && Math.abs(s.velocity)<1e-5;
  }
  snap(position,stretch=false,previous=true){
    const p=stretch?'stretchPosition':'position',v=stretch?'stretchVelocity':'velocity';
    for(const state of previous?[this.currentState,this.previousState,this.renderState]:[this.currentState,this.renderState]){
      state[p]=position;state[v]=0;
    }
  }
  springStep(stretch=false){
    const s=this.currentState,p=stretch?'stretchPosition':'position',v=stretch?'stretchVelocity':'velocity',t=stretch?'stretchTarget':'target';
    if(this.near(stretch)){this.snap(s[t],stretch);return;}
    const {mass,stiffness,damping}=this.spring;
    s[v]+=(-stiffness*(s[p]-s[t])-damping*s[v])/mass*this.frameTimeTarget;
    s[p]+=s[v]*this.frameTimeTarget;
  }
  step(dt){
    if(!Number.isFinite(dt)||dt<=0)return this.currentState.position;
    // Match the source's semi-implicit integration and long-frame cap.
    this.frameTimeAccumulator+=Math.min(1/30,dt);
    const s=this.currentState;
    while(this.frameTimeAccumulator>=this.frameTimeTarget){
      for(const key of ['position','velocity','stretchPosition','stretchVelocity'])this.previousState[key]=s[key];
      if(this.magnetEngaging!==null && this.magnetEngaged===null && this.magnetDisengaging===null){
        const m=this.magnetEngaging;
        if(!this.pointerDown)s.target=s.stretchTarget=m.origin;
        if(this.attached(m))this.snap(m.origin);
        else{
          const distance=Math.abs(s.position-m.origin),direction=Math.sign(s.position-m.origin);
          const radiusScale=Math.sqrt(Math.pow(m.radius,2)/10);
          const force=m.strength*(radiusScale*-radiusScale/Math.pow(distance,2))*direction;
          s.velocity=Math.abs(s.velocity)*-this.attractionDirection+(distance<=m.radius?force:0)*this.frameTimeTarget;
          s.position+=s.velocity*this.frameTimeTarget;
        }
        this.springStep(true);
      }else if(this.magnetEngaging===null && this.magnetEngaged===null && this.magnetDisengaging===null){
        this.springStep();this.springStep(true);
        for(const m of this.magnets)if(this.inRadius(m)){
          this.attractionDirection=Math.sign(s.position-m.origin);s.target=m.origin;this.magnetEngaging=m;
        }
      }else if(this.magnetEngaging===null && this.magnetEngaged!==null && this.magnetDisengaging===null){
        if(!this.pointerDown)s.target=s.stretchTarget=this.magnetEngaged.origin;
        this.springStep(true);
        if(!this.inRadius(this.magnetEngaged,true)){this.magnetDisengaging=this.magnetEngaged;this.magnetEngaged=null;}
      }else if(this.magnetEngaging===null && this.magnetEngaged===null && this.magnetDisengaging!==null){
        this.springStep();this.springStep(true);
        if(Math.abs(s.target-this.magnetDisengaging.origin)<=this.magnetDisengaging.radius){
          this.magnetEngaging=this.magnetDisengaging;this.magnetDisengaging=null;
        }
        if(this.magnetDisengaging!==null && !this.inRadius(this.magnetDisengaging))this.magnetDisengaging=null;
      }
      this.frameTimeAccumulator-=this.frameTimeTarget;
    }
    const alpha=this.frameTimeAccumulator/this.frameTimeTarget;
    for(const key of ['position','velocity','stretchPosition','stretchVelocity'])
      this.renderState[key]=s[key]*alpha+this.previousState[key]*(1-alpha);
    // The source emits currentState, not its interpolated renderState.
    if(this.magnetEngaging!==null){
      if(this.attached(this.magnetEngaging)){
        this.snap(this.magnetEngaging.origin,false,false);this.magnetEngaged=this.magnetEngaging;this.magnetEngaging=null;
      }
    }else if(this.near())this.snap(s.target,false,false);
    if(this.near(true))this.snap(s.stretchTarget,true,false);
    return s.position;
  }
}
