const cursor = document.createElement("div");
cursor.style.position = "fixed";
cursor.style.left = "0";
cursor.style.top = "0";
cursor.style.borderRadius = "50%";
cursor.style.pointerEvents = "none";
cursor.style.zIndex = "2147483645";
(document.documentElement || document.body).appendChild(cursor);

const OVERLAY_MIN_SIZE=12, OVERLAY_MAX_SIZE=56, OVERLAY_DEFAULT_SIZE=18, OVERLAY_SIZE_STEP=2;
let overlaySize=OVERLAY_DEFAULT_SIZE;
function clamp(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function applyOverlaySize(size){
  overlaySize=clamp(Math.round(size),OVERLAY_MIN_SIZE,OVERLAY_MAX_SIZE);
  const borderPx=Math.max(1,Math.round(overlaySize*.11));
  const glowPx=Math.max(6,Math.round(overlaySize*.67));
  cursor.style.width=overlaySize+"px";
  cursor.style.height=overlaySize+"px";
  cursor.style.border=borderPx+"px solid #00eeff";
  cursor.style.boxShadow="0 0 "+glowPx+"px rgb(0,0,0)";
}
function adjustOverlaySize(delta){applyOverlaySize(overlaySize+delta);}
applyOverlaySize(OVERLAY_DEFAULT_SIZE);

window.addEventListener("keydown",e=>{
  if(!e.altKey)return;
  if(e.key==="["||e.key==="-"||e.key==="_"){e.preventDefault();adjustOverlaySize(-OVERLAY_SIZE_STEP);}
  else if(e.key==="]"||e.key==="="||e.key==="+"){e.preventDefault();adjustOverlaySize(OVERLAY_SIZE_STEP);}
},true);

let lastTarget=null,lastMove={x:0,y:0},lastDispatchAt=0;
let dwellTarget=null,dwellStartedAt=0;
function dispatchMove(x,y){
  const now=performance.now();
  if(now-lastDispatchAt<12)return;
  const dx=x-lastMove.x,dy=y-lastMove.y;
  if(dx*dx+dy*dy<4)return;
  lastMove={x,y};lastDispatchAt=now;
  const target=document.elementFromPoint(x,y);
  if(!target||target.closest("#omega-neural-root"))return;
  target.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,cancelable:true,clientX:x,clientY:y}));
  if(target!==lastTarget){
    target.dispatchEvent(new MouseEvent("mouseover",{bubbles:true,cancelable:true,clientX:x,clientY:y}));
    lastTarget=target;
  }
}
function dispatchClick(x,y,button){
  const target=document.elementFromPoint(x,y);
  if(!target||target.closest("#omega-neural-root"))return;
  const init={bubbles:true,cancelable:true,clientX:x,clientY:y,button};
  target.dispatchEvent(new MouseEvent("mousedown",init));
  target.dispatchEvent(new MouseEvent("mouseup",init));
  target.dispatchEvent(new MouseEvent(button===2?"contextmenu":"click",init));
}
chrome.runtime.onMessage.addListener(m=>{
  if(!m)return;
  if(m.type==="GAZE_PING"){
    chrome.runtime.sendMessage({type:"GAZE_ACK"},()=>{void chrome.runtime.lastError;});
    return;
  }
  if(m.type!=="GAZE_POS"||!m.payload)return;
  if(Number.isFinite(m.payload.overlaySize))applyOverlaySize(m.payload.overlaySize);
  const x=clamp(m.payload.x,0,1)*window.innerWidth;
  const y=clamp(m.payload.y,0,1)*window.innerHeight;
  cursor.style.transform="translate("+(x-overlaySize/2)+"px,"+(y-overlaySize/2)+"px)";
  const target=document.elementFromPoint(x,y);
  const safeTarget=target&&!target.closest("#omega-neural-root")?target:null;
  const now=performance.now();
  if(safeTarget!==dwellTarget){dwellTarget=safeTarget;dwellStartedAt=now;}
  const dwell=safeTarget?now-dwellStartedAt:0;
  if(window.OmegaNeuralBrowser&&safeTarget){
    window.OmegaNeuralBrowser.observe({
      x:x/window.innerWidth,y:y/window.innerHeight,
      confidence:Number.isFinite(m.payload.confidence)?m.payload.confidence/100:0.65,
      dwell,targetElement:safeTarget
    });
  }
  dispatchMove(x,y);
  // Eye gaze is attention, not consent. Clicks are disabled until explicitly enabled in the Omega panel.
  const clickEnabled=!!(window.OmegaNeuralBrowser&&window.OmegaNeuralBrowser.clickEnabled);
  if(clickEnabled&&m.payload.click)dispatchClick(x,y,0);
  if(clickEnabled&&m.payload.idleClick==="left")dispatchClick(x,y,0);
  if(clickEnabled&&m.payload.idleClick==="right")dispatchClick(x,y,2);
  chrome.runtime.sendMessage({type:"GAZE_ACK"},()=>{void chrome.runtime.lastError;});
});
