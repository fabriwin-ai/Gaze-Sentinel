(() => {
  "use strict";
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  class OmegaField {
    constructor(options={}) {
      this.size=7;
      this.theta=options.familiarityThreshold ?? 0.68;
      this.eta=options.learningRate ?? 0.12;
      this.budget=options.budget ?? 40;
      this.policy=options.policy ?? "topological";
      this.plasticity=options.plasticity ?? true;
      this.nodes=Array.from({length:49},(_,id)=>({
        id,x:id%7,y:Math.floor(id/7),membrane:0,activation:0,spikes:0
      }));
      this.synapses=[];
      for(const from of this.nodes) for(const to of this.nodes) {
        if(from.id!==to.id) this.synapses.push({
          from:from.id,to:to.id,weight:0,eligibility:0,updates:0
        });
      }
      this.outgoing=Array.from({length:49},()=>[]);
      for(const syn of this.synapses)this.outgoing[syn.from].push(syn);
      this.previousWinner=null;
      this.memory=[];this.history=[];this.tick=0;this.updates=0;
      this.last=null;this.lastPrediction=null;
    }
    classifyTarget(el) {
      if(!el)return "background";
      if(el.closest("video, audio"))return "media";
      if(el.closest("a"))return "link";
      if(el.closest("button,[role=button],input,textarea,select"))return "control";
      if(el.closest("h1,h2,h3,p,article,main"))return "content";
      return "other";
    }
    encode({x,y,target="other"}) {
      const typeCode=({background:0.1,other:0.25,content:0.45,link:0.65,media:0.8,control:0.95})[target]??0.25;
      const gx=clamp(x,0,1)*6,gy=clamp(y,0,1)*6;
      const winner=this.nodes.reduce((best,n)=>distance(n,{x:gx,y:gy})<distance(best,{x:gx,y:gy})?n:best,this.nodes[0]);
      return {winner,vector:[clamp(x,0,1),clamp(y,0,1),typeCode]};
    }
    predictFrom(sourceId) {
      if(sourceId===null||sourceId===undefined)return null;
      const edges=this.outgoing[sourceId].filter(e=>e.weight>0.015);
      const total=edges.reduce((s,e)=>s+e.weight,0);
      if(total<=0)return null;
      const distribution=edges.map(e=>({node:this.nodes[e.to],p:e.weight/total,weight:e.weight}));
      const predicted={x:distribution.reduce((s,e)=>s+e.node.x*e.p,0),
        y:distribution.reduce((s,e)=>s+e.node.y*e.p,0)};
      const best=distribution.slice().sort((a,b)=>b.p-a.p)[0];
      return {x:predicted.x/6,y:predicted.y/6,node:best.node.id,confidence:best.p,
        candidates:distribution.sort((a,b)=>b.p-a.p).slice(0,5).map(e=>({node:e.node.id,probability:e.p}))};
    }
    admit({novelty,predictionError,confidence,dwell}) {
      const tasks=[
        {id:"predict",cost:8,score:1.0+(predictionError??0.5)*0.4},
        {id:"memory",cost:12,score:novelty==="novel"?1.3:novelty==="variation"?0.8:0.35},
        {id:"context",cost:14,score:0.35+confidence*0.2},
        {id:"plasticity",cost:10,score:(predictionError??0.5)*0.9+(dwell>=700?0.2:0)}
      ];
      tasks.sort((a,b)=>b.score-a.score);
      let used=0;const admitted=[],deferred=[];
      for(const task of tasks) {
        if(used+task.cost<=this.budget){admitted.push(task.id);used+=task.cost;}
        else deferred.push(task.id);
      }
      return {admitted,deferred,used,budget:this.budget};
    }
    observe({x,y,target="other",confidence=0.5,dwell=0}) {
      const {winner,vector}=this.encode({x,y,target});
      const previousPrediction=this.predictFrom(this.previousWinner);
      const predictedPoint=previousPrediction?{x:previousPrediction.x*6,y:previousPrediction.y*6}:null;
      const predictionError=predictedPoint?clamp(distance(predictedPoint,winner)/Math.hypot(6,6),0,1):1;
      const familiarity=previousPrediction?clamp(Math.exp(-2.8*predictionError*predictionError),0,1):0.5;
      const novelty=familiarity<0.35?"novel":familiarity<this.theta?"variation":"familiar";
      const admission=this.admit({novelty,predictionError,confidence,dwell});

      for(const node of this.nodes) {
        const d=distance(node,winner);
        const input=Math.exp(-(d*d)/(2*0.85*0.85));
        node.membrane=clamp(node.membrane*0.72+input,0,1.5);
        node.activation=clamp(node.activation*0.78+input*0.22,0,1);
        if(node.membrane>=0.92){node.spikes++;node.membrane*=0.22;}
      }

      if(this.plasticity&&admission.admitted.includes("plasticity")&&this.previousWinner!==null) {
        const edges=this.outgoing[this.previousWinner];
        for(const edge of edges) {
          edge.eligibility=clamp(edge.eligibility*0.88+(edge.to===winner.id?1:0),0,1);
          edge.weight=clamp(edge.weight+this.eta*(edge.eligibility-0.025),0,1);
          if(edge.eligibility>0.05)edge.updates++;
        }
        this.updates++;
      }
      if(admission.admitted.includes("memory")) {
        this.memory.push({tick:this.tick+1,target,x:vector[0],y:vector[1],node:winner.id,
          familiarity,novelty,predictionError});
        if(this.memory.length>24)this.memory.shift();
      }
      const nextPrediction=this.predictFrom(winner.id);
      this.history.push({node:winner.id,target,vector});
      if(this.history.length>32)this.history.shift();
      this.tick++;
      this.lastPrediction=previousPrediction;
      this.last={target,familiarity,novelty,error:predictionError,predictionError,
        predictedNode:previousPrediction?.node??null,predictionConfidence:previousPrediction?.confidence??0,
        nearest:winner.id,activeCount:this.nodes.filter(n=>n.activation>0.25).length,
        admitted:admission.admitted,deferred:admission.deferred,used:admission.used,budget:admission.budget,
        confidence:clamp(confidence,0,1),dwell};
      this.previousWinner=winner.id;
      return this.snapshot();
    }
    snapshot() {
      return {tick:this.tick,last:this.last,nodes:this.nodes.map(n=>({...n})),
        synapseCount:this.synapses.length,learnedSynapses:this.synapses.filter(s=>s.weight>0.015).length,
        memory:this.memory.slice(-6),updates:this.updates,
        settings:{policy:this.policy,budget:this.budget,plasticity:this.plasticity,threshold:this.theta,learningRate:this.eta}};
    }
    configure(patch={}) {
      if(patch.policy&&["uniform","topological","temporal"].includes(patch.policy))this.policy=patch.policy;
      if(Number.isFinite(patch.budget))this.budget=clamp(patch.budget,10,100);
      if(typeof patch.plasticity==="boolean")this.plasticity=patch.plasticity;
      if(Number.isFinite(patch.learningRate))this.eta=clamp(patch.learningRate,0.001,0.5);
      return this.snapshot();
    }
    clearMemory(){this.memory=[];this.history=[];return this.snapshot();}
    resetLearning(){for(const edge of this.synapses){edge.weight=0;edge.eligibility=0;edge.updates=0;}this.updates=0;this.previousWinner=null;return this.snapshot();}
  }
  window.OmegaField=OmegaField;
})();