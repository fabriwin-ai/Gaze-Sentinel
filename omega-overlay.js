(() => {
  "use strict";
  if(window.__OMEGA_OVERLAY_INSTALLED__) return;
  window.__OMEGA_OVERLAY_INSTALLED__=true;
  const field=new window.OmegaField();
  let enabled=true, gazeClickEnabled=false, latestTarget=null, lastPoint=null, dwellStart=0, snapshot=null;
  const root=document.createElement("div");root.id="omega-neural-root";
  root.innerHTML=`
    <section class="omega-panel" aria-label="Omega Neural Browser">
      <header class="omega-head"><div><span class="omega-kicker">KRO-NOS · SNNF</span><strong>Ω NEURAL BROWSER</strong></div><button class="omega-min" title="Minimizar panel">−</button></header>
      <div class="omega-status"><i class="omega-led"></i><span id="om-status">SENSOR WAITING</span><span id="om-tick">T 0</span></div>
      <div class="omega-focus"><small>ATTENTION TARGET</small><b id="om-target">Sin objetivo</b><div class="omega-metrics"><span>F <b id="om-familiarity">--</b></span><span>ERROR <b id="om-error">--</b></span><span>NODE <b id="om-node">--</b></span></div></div>
      <div class="omega-field"><div class="omega-section"><span>OMEGA FIELD · 7×7</span><span id="om-horizon">SOON</span></div><div id="om-grid" class="omega-grid"></div></div>
      <div class="omega-admission"><div class="omega-section"><span>KRO-NOS ADMISSION</span><span id="om-budget">0 / 40</span></div><div id="om-tasks" class="omega-tasks">Esperando estímulos…</div></div>
      <div class="omega-controls">
        <button id="om-pause">Pausar campo</button><button id="om-click" class="omega-safe">Clic ocular: OFF</button>
        <div class="omega-actions"><button id="om-up">↑ Scroll</button><button id="om-down">↓ Scroll</button><button id="om-focus">Enfocar objetivo</button></div>
      </div>
      <footer><span id="om-memory">MEM 0/24 · PLASTICITY ON</span><button id="om-clear">Limpiar memoria</button></footer>
    </section><button class="omega-tab" aria-label="Abrir panel Omega">Ω</button>`;
  (document.documentElement||document.body).appendChild(root);
  const $=id=>root.querySelector("#"+id);
  const grid=$("om-grid");
  for(let i=0;i<49;i++){const n=document.createElement("i");n.className="omega-node";n.dataset.node=i;grid.appendChild(n);}
  const panel=root.querySelector(".omega-panel"), tab=root.querySelector(".omega-tab");
  root.querySelector(".omega-min").addEventListener("click",()=>{panel.classList.add("is-hidden");tab.classList.add("is-visible");});
  tab.addEventListener("click",()=>{panel.classList.remove("is-hidden");tab.classList.remove("is-visible");});
  $("om-pause").addEventListener("click",e=>{enabled=!enabled;e.currentTarget.textContent=enabled?"Pausar campo":"Reanudar campo";$("om-status").textContent=enabled?"FIELD ACTIVE":"FIELD PAUSED";});
  $("om-click").addEventListener("click",e=>{gazeClickEnabled=!gazeClickEnabled;e.currentTarget.textContent="Clic ocular: "+(gazeClickEnabled?"ON":"OFF");e.currentTarget.classList.toggle("is-danger",gazeClickEnabled);});
  $("om-up").addEventListener("click",()=>window.scrollBy({top:-Math.max(280,innerHeight*.7),behavior:"smooth"}));
  $("om-down").addEventListener("click",()=>window.scrollBy({top:Math.max(280,innerHeight*.7),behavior:"smooth"}));
  $("om-focus").addEventListener("click",()=>{if(!latestTarget||root.contains(latestTarget))return;latestTarget.scrollIntoView({behavior:"smooth",block:"center"});if(latestTarget.matches("a,button,input,textarea,select,[tabindex]"))latestTarget.focus({preventScroll:true});});
  $("om-clear").addEventListener("click",()=>{snapshot=field.clearMemory();render(snapshot);});
  function render(s){
    if(!s||!s.last)return;
    const v=s.last;
    $("om-status").textContent=enabled?"FIELD ACTIVE":"FIELD PAUSED";
    $("om-tick").textContent="T "+s.tick;
    $("om-target").textContent=v.target.toUpperCase();
    $("om-familiarity").textContent=v.familiarity.toFixed(2);
    $("om-error").textContent=v.error.toFixed(3);
    $("om-node").textContent="#"+v.nearest;
    $("om-horizon").textContent=v.horizon.toUpperCase();
    $("om-budget").textContent=v.used+" / "+v.budget;
    $("om-memory").textContent="MEM "+s.memory.length+"/24 · PLASTICITY "+(s.settings.plasticity?"ON":"OFF");
    const active=new Set(s.last.topology.filter(t=>t.band==="closest").map(t=>t.id));
    grid.querySelectorAll(".omega-node").forEach(el=>{const n=s.nodes[Number(el.dataset.node)];el.style.opacity=String(.2+n.activation*.8);el.classList.toggle("is-near",active.has(n.id));el.classList.toggle("is-hot",n.id===v.nearest);});
    $("om-tasks").textContent="Admit: "+v.admitted.join(" · ")+" | Deferred: "+(v.deferred.join(" · ")||"none");
  }
  window.OmegaNeuralBrowser={
    get clickEnabled(){return gazeClickEnabled;},
    observe({x,y,confidence=0.5,dwell=0,targetElement=null}){
      if(!enabled)return;
      latestTarget=targetElement;
      const target=field.classifyTarget(targetElement);
      snapshot=field.observe({x,y,target,confidence,dwell});render(snapshot);
    },
    getSnapshot(){return snapshot;}
  };
  window.addEventListener("keydown",e=>{if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==="o"){panel.classList.toggle("is-hidden");tab.classList.toggle("is-visible",panel.classList.contains("is-hidden"));}});
})();