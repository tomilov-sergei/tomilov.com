import {TourSpring} from './tour-spring.js';

export const tourLabels = ['PT_SliderClosed','PT_SliderLanding','PT_SliderOpen',
  'PT_Landscape','PT_Portrait','PT_Closed','PT_Laptop','PT_Tent','PT_Durability'];
export const hingeTargets = [0,1/3,1,1,1,0,.5111,.25,.3333];
export class TourState {
  constructor(){
    this.weights=tourLabels.map((_,i)=>i===0?1:0);
    this.targets=this.weights.slice();this.velocities=this.weights.map(()=>0);
    this.spring=new TourSpring({stiffness:20,damping:.95});
    this.label=null;this.active=false;this.revision=0;
  }
  setFold(fold){
    const f=Math.max(0,Math.min(1,fold)),i=f<=1/3?0:1,t=i===0?f*3:(f-1/3)*1.5;
    this.weights.fill(0);this.weights[i]=1-t;this.weights[i+1]=t;
    this.targets=this.weights.slice();this.velocities.fill(0);
    this.label=null;this.active=false;this.revision++;
  }
  select(label){
    if(!tourLabels.includes(label))throw new Error(`Unknown tour state: ${label}`);
    // Retarget without discarding momentum, as VariantWeights.setWeightTargets.
    this.targets=tourLabels.map(name=>name===label?1:0);
    this.label=label;this.active=true;this.revision++;
  }
  step(dt){
    if(!this.active || !Number.isFinite(dt) || dt<=0)return false;
    this.active=false;
    this.weights=this.weights.map((value,i)=>{
      const next=this.spring.update(value,this.targets[i],this.velocities[i],dt);
      this.velocities[i]=next.velocity;this.active ||= next.updated;
      return next.value;
    });
    this.revision++;return true;
  }
  sample(values){return values.reduce((sum,value,i)=>sum+value*this.weights[i],0);}
  get fold(){return this.sample(hingeTargets);}
  get screenLabel(){
    // FadeThroughBlack resolves the strongest current weight, not the requested pose.
    let index=0;
    for(let i=1;i<this.weights.length;i++)if(Math.abs(this.weights[i])>Math.abs(this.weights[index]))index=i;
    return index<3 ? null : tourLabels[index];
  }
}
export const tourState = new TourState();
export const sampleTour = values => tourState.sample(values);
export function mergeVariant(variants,label){
  const result={};
  for(const variant of variants.filter(v=>v['@states']?.includes(label)))
    for(const [name,props] of Object.entries(variant))
      if(name!=='@states') result[name]={...result[name],...props};
  return result;
}
