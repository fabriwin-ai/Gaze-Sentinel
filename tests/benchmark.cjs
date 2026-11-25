const { performance } = require("node:perf_hooks");
const { OmegaField } = (() => {
  global.window = {};
  require("../omega-core.js");
  return { OmegaField: global.window.OmegaField };
})();

const A={x:0.1,y:0.1,target:"link",confidence:1,dwell:900};
const B={x:0.9,y:0.1,target:"content",confidence:1,dwell:900};
const C={x:0.9,y:0.9,target:"control",confidence:1,dwell:900};
const cycle=[A,B,C];
const trainRepeats=40, evalRepeats=20;

function train(field) {
  for(let r=0;r<trainRepeats;r++) for(const item of cycle) field.observe(item);
}
function evaluateField(field) {
  let hits=0,total=0,error=0;
  for(let r=0;r<evalRepeats;r++) {
    for(let i=0;i<cycle.length;i++) {
      const current=field.encode(cycle[i]).winner.id;
      const expected=field.encode(cycle[(i+1)%cycle.length]).winner.id;
      const prediction=field.predictFrom(current);
      if(prediction) {
        total++;
        if(prediction.node===expected)hits++;
        const p=field.nodes[prediction.node];
        const e=field.nodes[expected];
        error+=Math.hypot(p.x-e.x,p.y-e.y)/Math.hypot(6,6);
      }
      field.observe(cycle[(i+1)%cycle.length]);
    }
  }
  return {accuracy:total?hits/total:0,meanNormalizedError:total?error/total:1,predictions:total};
}
function frequencyBaseline() {
  const counts=new Map();
  for(let r=0;r<trainRepeats;r++) for(let i=0;i<cycle.length;i++) {
    const from=i, to=(i+1)%cycle.length;
    counts.set(from+"->"+to,(counts.get(from+"->"+to)||0)+1);
  }
  let hits=0,total=0;
  for(let r=0;r<evalRepeats;r++) for(let i=0;i<cycle.length;i++) {
    const predicted=(i+1)%cycle.length;
    const actual=(i+1)%cycle.length;
    if(counts.has(i+"->"+predicted)){total++;if(predicted===actual)hits++;}
  }
  return {accuracy:total?hits/total:0,predictions:total};
}
function run(plasticity) {
  const field=new OmegaField({budget:100,plasticity,learningRate:0.12});
  const start=performance.now();
  train(field);
  const trainMs=performance.now()-start;
  const evalStart=performance.now();
  const metrics=evaluateField(field);
  const evalMs=performance.now()-evalStart;
  return {...metrics,trainMs:Number(trainMs.toFixed(3)),evalMs:Number(evalMs.toFixed(3)),
    learnedSynapses:field.snapshot().learnedSynapses,updates:field.updates};
}
console.log(JSON.stringify({
  protocol:{trainRepeats,evalRepeats,sequence:"A→B→C→A",note:"Synthetic deterministic sanity check; not a browser benchmark."},
  plasticityOn:run(true),
  plasticityOff:run(false),
  frequencyBaseline:frequencyBaseline()
},null,2));
