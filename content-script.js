const cursor = document.createElement("div")
cursor.style.position = "fixed"
cursor.style.left = "0"
cursor.style.top = "0"
cursor.style.width = "18px"
cursor.style.height = "18px"
cursor.style.border = "2px solid #00ff9d"
cursor.style.borderRadius = "50%"
cursor.style.boxShadow = "0 0 12px rgba(0,255,157,0.9)"
cursor.style.pointerEvents = "none"
cursor.style.zIndex = "2147483647"
document.documentElement.appendChild(cursor)
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
  const x = Math.max(0, Math.min(1, m.payload.x)) * window.innerWidth
  const y = Math.max(0, Math.min(1, m.payload.y)) * window.innerHeight
  cursor.style.transform = `translate(${x - 9}px, ${y - 9}px)`
  dispatchMove(x, y)
  if (m.payload.click) dispatchClick(x, y, 0)
  if (m.payload.idleClick === "left") dispatchClick(x, y, 0)
  if (m.payload.idleClick === "right") dispatchClick(x, y, 2)
  chrome.runtime.sendMessage({ type: "GAZE_ACK" }, () => {
    if (chrome.runtime.lastError) return
  })
})
