// === SENSE RAY - Minimal Crisp Aesthetic Overlay (LUT Optimized) ===
const canvas = document.createElement("canvas")
canvas.id = "sense-ray-overlay"
canvas.style.position = "fixed"
canvas.style.top = "0"
canvas.style.left = "0"
canvas.style.pointerEvents = "none"
canvas.style.zIndex = "2147483647"
canvas.style.mixBlendMode = "screen"
document.documentElement.appendChild(canvas)

let ctx, w = innerWidth, h = innerHeight
let gx = w / 2, gy = h / 2
let lastTarget = null
let lastMoveAt = 0
let dwellProgress = true
let isTraceRecording = false

// Spark Object Pool
const MAX_SPARKS = 12
const sparkPool = []
for (let i = 0; i < MAX_SPARKS; i++) {
  sparkPool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, active: false })
}
let activeSparks = 0

// === SIN/COS LOOKUP TABLE ===
const LUT_SIZE = 1024
const sinLUT = new Float32Array(LUT_SIZE)
const cosLUT = new Float32Array(LUT_SIZE)
const TWO_PI = Math.PI * 2

for (let i = 0; i < LUT_SIZE; i++) {
  const angle = (i / LUT_SIZE) * TWO_PI
  sinLUT[i] = Math.sin(angle)
  cosLUT[i] = Math.cos(angle)
}

function fastSin(x) {
  const idx = Math.floor(((x % TWO_PI + TWO_PI) % TWO_PI) * (LUT_SIZE / TWO_PI)) % LUT_SIZE
  return sinLUT[idx]
}

function fastCos(x) {
  const idx = Math.floor(((x % TWO_PI + TWO_PI) % TWO_PI) * (LUT_SIZE / TWO_PI)) % LUT_SIZE
  return cosLUT[idx]
}

function resize() {
  w = innerWidth
  h = innerHeight
  canvas.width = w
  canvas.height = h
}
window.addEventListener("resize", resize)
resize()

ctx = canvas.getContext("2d", { alpha: true })

// Keyboard size adjust
let overlaySize = 18
window.addEventListener("keydown", e => {
  if (!e.altKey) return
  if (e.key === "[" || e.key === "-") overlaySize = Math.max(12, overlaySize - 2)
  if (e.key === "]" || e.key === "=") overlaySize = Math.min(56, overlaySize + 2)
}, true)

function getTarget(x, y) {
  let el = document.elementFromPoint(x, y)
  while (el && (el.style.pointerEvents === 'none' || el.id === "sense-ray-overlay")) {
    el = el.parentElement
  }
  return el || document.body
}

function dispatchMove(x, y) {
  const now = performance.now()
  if (now - lastMoveAt < 9) return
  lastMoveAt = now

  const target = getTarget(x, y)
  if (!target) return

  const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window }
  target.dispatchEvent(new MouseEvent("mousemove", opts))

  if (target !== lastTarget) {
    if (lastTarget) lastTarget.dispatchEvent(new MouseEvent("mouseleave", {...opts}))
    target.dispatchEvent(new MouseEvent("mouseenter", {...opts}))
    lastTarget = target
  }

  if (["BUTTON","A","VIDEO","INPUT"].includes(target.tagName) || target.onclick || target.href) {
    target.focus()
  }
}

function dispatchClick(x, y, button = 0) {
  const target = getTarget(x, y)
  if (!target) return
  const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button, view: window }

  target.dispatchEvent(new MouseEvent("mousedown", opts))
  target.dispatchEvent(new MouseEvent("mouseup", opts))
  if (button === 0) target.dispatchEvent(new MouseEvent("click", opts))
  else if (button === 2) target.dispatchEvent(new MouseEvent("contextmenu", opts))

  setTimeout(() => target.click && target.click(), 10)
}

chrome.runtime.onMessage.addListener((m) => {
  if (!m?.payload) return

  if (m.type === "GAZE_PING") {
    chrome.runtime.sendMessage({ type: "GAZE_ACK" })
    return
  }

  const p = m.payload
  gx = p.x * w
  gy = p.y * h
  isTraceRecording = !!p.trace
  dwellProgress = p.dwellProgress || 0

  dispatchMove(gx, gy)

  if (p.click) dispatchClick(gx, gy, 0)
  if (p.idleClick === "left") dispatchClick(gx, gy, 0)
  if (p.idleClick === "right") dispatchClick(gx, gy, 2)
  if (p.scroll) window.scrollBy({ top: p.scroll, behavior: "smooth" })

  chrome.runtime.sendMessage({ type: "GAZE_ACK" })
})

// === ULTRA MINIMAL RETICLE (LUT + NO BLUR) ===
function drawReticle() {
  ctx.clearRect(0, 0, w, h)

  const t = Date.now() / 85   // responsive speed

  // Tiny crosshair
  ctx.strokeStyle = "#00ff9d"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(gx - 14, gy)
  ctx.lineTo(gx + 14, gy)
  ctx.moveTo(gx, gy - 14)
  ctx.lineTo(gx, gy + 14)
  ctx.stroke()

  // Small inner circle
  ctx.beginPath()
  ctx.arc(gx, gy, 9, 0, Math.PI * 2)
  ctx.stroke()

  // Fast orbiting symbols using LUT
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 11px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const syms = "⚡ΦΨΔλΣ"
  for (let i = 0; i < 14; i++) {
    const a = t * 2.8 + i * 0.65
    const r = 18 + (i % 3) * 3
    const x = gx + fastCos(a) * r
    const y = gy + fastSin(a) * r
    ctx.fillText(syms[i % syms.length], x, y)
  }

  // Sparks using fixed pool
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkPool[i]
    if (!s.active) continue
    const alpha = s.life / 18
    ctx.fillStyle = `rgba(0,255,157,${alpha})`
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3)

    s.x += s.vx
    s.y += s.vy
    s.life -= 1.1
    if (s.life <= 0) {
      s.active = false
      activeSparks--
    }
  }

  // Spawn new sparks
  if (Math.random() < 0.65 && activeSparks < MAX_SPARKS - 2) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparkPool[i]
      if (!s.active) {
        s.x = gx + (Math.random() - 0.5) * 18
        s.y = gy + (Math.random() - 0.5) * 18
        s.vx = (Math.random() - 0.5) * 3.2
        s.vy = (Math.random() - 0.5) * 3.2
        s.life = 14 + Math.random() * 9
        s.active = true
        activeSparks++
        break
      }
    }
  }

  // Tiny dwell ring
  if (dwellProgress > 0.05) {
    ctx.strokeStyle = "#ffd700"
    ctx.lineWidth = 8.2
    ctx.beginPath()
    ctx.arc(gx, gy, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwellProgress)
    ctx.stroke()
  }

  requestAnimationFrame(drawReticle)
}
drawReticle()

// Cleanup
window.addEventListener("beforeunload", () => canvas.remove())