/**
 * Analytical spring ported from Lotus module 7298 in the saved vendor bundle.
 * Source notice: Uses portions of the Android Open Source Project under the
 * Apache 2.0 License, http://www.apache.org/licenses/LICENSE-2.0
 */
export class TourSpring {
  constructor({stiffness=20,damping=.95}={}){
    if(stiffness<=0 || damping<0)throw new Error('Invalid spring parameters');
    this.stiffness=stiffness;this.damping=damping;
  }
  update(value,target,velocity,dt){
    const frequency=Math.sqrt(this.stiffness), damping=this.damping;
    const offset=value-target;
    let position,speed;
    if(damping>1){
      const plus=-damping*frequency+frequency*Math.sqrt(damping*damping-1);
      const minus=-damping*frequency-frequency*Math.sqrt(damping*damping-1);
      const a=offset-(minus*offset-velocity)/(minus-plus);
      const b=(minus*offset-velocity)/(minus-plus);
      position=a*Math.pow(Math.E,minus*dt)+b*Math.pow(Math.E,plus*dt);
      speed=a*minus*Math.pow(Math.E,minus*dt)+b*plus*Math.pow(Math.E,plus*dt);
    }else if(damping===1){
      const b=velocity+frequency*offset, decay=Math.pow(Math.E,-frequency*dt);
      position=(offset+b*dt)*decay;
      speed=(offset+b*dt)*decay*-frequency+b*decay;
    }else{
      const damped=frequency*Math.sqrt(1-damping*damping);
      const b=(damping*frequency*offset+velocity)/damped;
      const decay=Math.pow(Math.E,-damping*frequency*dt);
      position=decay*(offset*Math.cos(damped*dt)+b*Math.sin(damped*dt));
      speed=position*-frequency*damping+decay*(-damped*offset*Math.sin(damped*dt)+damped*b*Math.cos(damped*dt));
    }
    let updated=true;
    if(Math.abs(position)<.001 && Math.abs(speed)<.001){position=speed=0;updated=false;}
    return {value:position+target,velocity:speed,updated};
  }
}
