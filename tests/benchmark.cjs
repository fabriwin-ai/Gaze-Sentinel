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
  const encoder=new OmegaField({plasticity:false});
  const ids=cycle.map(item=>encoder.encode(item).winner.id);
  const counts=new Map();
  for(let r=0;r<trainRepeats;r++) for(let i=0;i<ids.length;i++) {
    const from=ids[i],to=ids[(i+1)%ids.length];
    if(!counts.has(from))counts.set(from,new Map());
    const row=counts.get(from);row.set(to,(row.get(to)||0)+1);
  }
  let hits=0,total=0;
  for(let r=0;r<evalRepeats;r++) for(let i=0;i<ids.length;i++) {
    const row=counts.get(ids[i]);
    if(!row||row.size===0)continue;
    const predicted=[...row.entries()].sort((a,b)=>b[1]-a[1])[0][0];
    total++;
    if(predicted===ids[(i+1)%ids.length])hits++;
  }
  return {accuracy:total?hits/total:0,predictions:total};
}
