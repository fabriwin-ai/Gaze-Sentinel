(() => {
  "use strict";
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
  class OmegaField {
    constructor(options={}) {
      this.size=7; this.theta=options.familiarityThreshold ?? 0.68;
      this.eta=options.learningRate ?? 0.08; this.budget=options.budget ?? 40;
      this.policy=options.policy ?? "topological"; this.plasticity=options.plasticity ?? true;
      this.prediction=[0.5,0.5,0.5]; this.variance=[0.08,0.08,0.08];
      this.memory=[]; this.updates=0; this.tick=0; this.last=null;
      this.nodes=Array.from({length:49},(_,i)=>({id:i,x:i%7,y:Math.floor(i/7),activation:0,updates:0,prototype:[0.5,0.5,0.5]}));
      this.history=[];
    }
    classifyTarget(el) {
      if(!el) return "background";
      if(el.closest("video, audio")) return "media";
      if(el.closest("a")) return "link";
      if(el.closest("button,[role=button],input,textarea,select")) return "control";
      if(el.closest("h1,h2,h3,p,article,main")) return "content";
      return "other";
    }
    observe({x,y,target="other",confidence=0.5,dwell=0}) {
      const typeCode=({background:0.1,other:0.25,content:0.45,link:0.65,media:0.8,control:0.95})[target] ?? 0.25;
      const obs=[clamp(x,0,1),clamp(y,0,1),typeCode];
      const err=obs.map((v,i)=>Math.abs(v-this.prediction[i]));
      const z=mean(err.map((v,i)=>v/Math.sqrt(this.variance[i]+0.01)));
      const familiarity=clamp(Math.exp(-0.42*z*z),0,1);
      const novelty=familiarity<0.35?"novel":familiarity<this.theta?"variation":"familiar";
      const gx=Math.round(obs[0]*6), gy=Math.round(obs[1]*6);
      const distances=this.nodes.map(n=>({node:n,d:Math.hypot(n.x-gx,n.y-gy)})).sort((a,b)=>a.d-b.d);
      const nearest=distances[0].node;
      this.nodes.forEach(n=>n.activation*=0.92);
      nearest.activation=clamp(0.35+confidence*0.45+dwell/2500,0,1);
      const topology=distances.map(o=>({id:o.node.id,d:o.d,band:o.d<1.5?"closest":o.d<3.2?"close":"far"}));
      const horizon=dwell>=700?"recently":"soon";
      const trend=this.history.length?obs.map((v,i)=>clamp(v+(v-this.history[this.history.length-1][i]),0,1)):obs.slice();
      const tasks=[
        {id:"predict",topology:"closest",horizon:"soon",cost:8,priority:1},
        {id:"memory",topology:"close",horizon:"recently",cost:12,priority:2},
        {id:"context",topology:"far",horizon:"later",cost:14,priority:3},
        {id:"plasticity",topology:"closest",horizon:"recently",cost:10,priority:4}
      ];
      const rank=t=>this.policy==="uniform"?t.priority:this.policy==="temporal"?(t.horizon==="soon"?0:t.horizon==="recently"?1:2):({closest:0,close:1,far:2}[t.topology]);
      tasks.sort((a,b)=>rank(a)-rank(b)||a.priority-b.priority);
      let used=0,blocked=false; const admitted=[],deferred=[];
      for(const task of tasks){if(!blocked&&used+task.cost<=this.budget){admitted.push(task.id);used+=task.cost;}else{blocked=true;deferred.push(task.id);}}
      if(admitted.includes("predict")&&familiarity>=this.theta){
        this.prediction=this.prediction.map((v,i)=>v+this.eta*(obs[i]-v));
        this.variance=this.variance.map((v,i)=>0.92*v+0.08*(obs[i]-this.prediction[i])**2);
      }
      if(this.plasticity&&admitted.includes("plasticity")&&familiarity>=this.theta){
        nearest.prototype=nearest.prototype.map((v,i)=>v+this.eta*(obs[i]-v)); nearest.updates++; this.updates++;
      }
      if(admitted.includes("memory")){this.memory.push({at:Date.now(),target,x:obs[0],y:obs[1],familiarity,novelty});if(this.memory.length>24)this.memory.shift();}
      this.history.push(obs);if(this.history.length>8)this.history.shift();
      this.tick++;
      this.last={target,familiarity,novelty,error:mean(err),nearest:nearest.id,topology,horizon,trend,admitted,deferred,used,budget:this.budget,confidence,dwell};
      return this.snapshot();
    }
    snapshot(){return {tick:this.tick,last:this.last,nodes:this.nodes.map(n=>({...n})),memory:this.memory.slice(-6),updates:this.updates,settings:{policy:this.policy,budget:this.budget,plasticity:this.plasticity,threshold:this.theta}};}
    configure(patch){if(patch.policy)this.policy=patch.policy;if(Number.isFinite(patch.budget))this.budget=clamp(patch.budget,10,100);if(typeof patch.plasticity==="boolean")this.plasticity=patch.plasticity;return this.snapshot();}
    clearMemory(){this.memory=[];this.history=[];return this.snapshot();}
  }
  window.OmegaField=OmegaField;
})();