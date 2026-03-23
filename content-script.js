const cursor = document.createElement("div")
cursor.style.position = "fixed"
cursor.style.left = "0"
cursor.style.top = "0"
cursor.style.borderRadius = "50%"
cursor.style.pointerEvents = "none"
cursor.style.zIndex = "2147483647"
document.documentElement.appendChild(cursor)

const OVERLAY_MIN_SIZE = 12
const OVERLAY_MAX_SIZE = 56
const OVERLAY_DEFAULT_SIZE = 18
const OVERLAY_SIZE_STEP = 2
let overlaySize = OVERLAY_DEFAULT_SIZE

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function applyOverlaySize(size) {
  overlaySize = clamp(Math.round(size), OVERLAY_MIN_SIZE, OVERLAY_MAX_SIZE)
  const borderPx = Math.max(1, Math.round(overlaySize * 0.11))
  const glowPx = Math.max(6, Math.round(overlaySize * 0.67))
  cursor.style.width = `${overlaySize}px`
  cursor.style.height = `${overlaySize}px`
  cursor.style.border = `${borderPx}px solid #00eeff`
  cursor.style.boxShadow = `0 0 ${glowPx}px rgb(0, 0, 0)`
}

function adjustOverlaySize(delta) {
  applyOverlaySize(overlaySize + delta)
  console.log(`[SENSE RAY] OVERLAY SIZE ${overlaySize}px`)
}

applyOverlaySize(OVERLAY_DEFAULT_SIZE)

window.addEventListener("keydown", (e) => {
  if (!e.altKey) return
  if (e.key === "[" || e.key === "-" || e.key === "_") {
    e.preventDefault()
    adjustOverlaySize(-OVERLAY_SIZE_STEP)
    return
  }
  if (e.key === "]" || e.key === "=" || e.key === "+") {
    e.preventDefault()
    adjustOverlaySize(OVERLAY_SIZE_STEP)
  }
}, true)

let lastTarget = null
let lastMove = { x: 0, y: 0 }
let lastDispatchAt = 0
function dispatchMove(x, y) {
  const now = performance.now()
  if (now - lastDispatchAt < 12) return
  const dx = x - lastMove.x
  const dy = y - lastMove.y
  if (dx * dx + dy * dy < 4) return
  lastMove = { x, y }
  lastDispatchAt = now
  const target = document.elementFromPoint(x, y)
  const ev = new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y })
  if (target) target.dispatchEvent(ev)
  if (target && target !== lastTarget) {
    const over = new MouseEvent("mouseover", { bubbles: true, cancelable: true, clientX: x, clientY: y })
    target.dispatchEvent(over)
    lastTarget = target
  }
}
function dispatchClick(x, y, button) {
  const target = document.elementFromPoint(x, y)
  if (!target) return
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  const up = new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  const click = new MouseEvent(button === 2 ? "contextmenu" : "click", { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  target.dispatchEvent(down)
  target.dispatchEvent(up)
  target.dispatchEvent(click)
}
chrome.runtime.onMessage.addListener((m) => {
  if (!m) return
  if (m.type === "GAZE_PING") {
    chrome.runtime.sendMessage({ type: "GAZE_ACK" }, () => {
      if (chrome.runtime.lastError) return
    })
    return
  }
  if (m.type !== "GAZE_POS" || !m.payload) return
  if (Number.isFinite(m.payload.overlaySize)) applyOverlaySize(m.payload.overlaySize)
  const x = Math.max(0, Math.min(1, m.payload.x)) * window.innerWidth
  const y = Math.max(0, Math.min(1, m.payload.y)) * window.innerHeight
  cursor.style.transform = `translate(${x - overlaySize / 2}px, ${y - overlaySize / 2}px)`
  dispatchMove(x, y)
  if (m.payload.click) dispatchClick(x, y, 0)
  if (m.payload.idleClick === "left") dispatchClick(x, y, 0)
  if (m.payload.idleClick === "right") dispatchClick(x, y, 2)
  chrome.runtime.sendMessage({ type: "GAZE_ACK" }, () => {
    if (chrome.runtime.lastError) return
  })
})
