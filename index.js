const video = document.getElementById("video")
const proc = document.getElementById("process")
const pctx = proc.getContext("2d", { willReadFrequently: true })
const ctx = document.getElementById("overlay").getContext("2d")
const bgctx = document.getElementById("bg").getContext("2d")

const frames = [new Uint8ClampedArray(4800), new Uint8ClampedArray(4800), new Uint8ClampedArray(4800)]
let fidx = 0
let gx = innerWidth / 2
let gy = innerHeight / 2
let targetX = gx
let targetY = gy
let confidence = 60

// === 8-LAYER DEEP NEURAL RETICLE + 4 VISUAL THEMES ===
let showCover = true
const PRODUCT = "SENSE"
const TAGLINE = "VALUABLE PROFIT PROJECT"
const SUBLINE = "$ REMUNERABLE COVER"

let currentProfile = 'ray2'
const PROFILES = {
  ray1: { name: 'RAY-1 BLASTER',   motionTh: 68,  minCount: 13, alphaBase: 0.39, alphaMaxAdd: 0.61 },
  ray2: { name: 'RAY-2 PHASER',    motionTh: 89,  minCount: 18, alphaBase: 0.31, alphaMaxAdd: 0.54 },
  ray3: { name: 'RAY-3 SNIPER',    motionTh: 115, minCount: 25, alphaBase: 0.22, alphaMaxAdd: 0.41 }
}

let currentTheme = 'balanced'
const THEMES = {
  minimal:     { name: '4 MINIMAL',     blurMult: 0.52, orbitCount: 24, synapse: false, pulses: 4,  color1: '#00ff9d', color2: '#ffffff' },
  balanced:    { name: '5 BALANCED',    blurMult: 1.00, orbitCount: 42, synapse: true,  pulses: 12, color1: '#00ff9d', color2: '#00ff41' },
  performance: { name: '6 PERFORMANCE', blurMult: 0.38, orbitCount: 26, synapse: false, pulses: 0,  color1: '#00ff9d', color2: '#00ff41' },
  fancy:       { name: '7 FANCY',       blurMult: 1.55, orbitCount: 58, synapse: true,  pulses: 20, color1: '#ff00ff', color2: '#ffd700' }
}

let motionTh = PROFILES.ray2.motionTh
let minCount = PROFILES.ray2.minCount
let alphaBase = PROFILES.ray2.alphaBase
let alphaMaxAdd = PROFILES.ray2.alphaMaxAdd

let irExposure = 55
let isTraceRecording = false

let sparks = []
let closedFrames = 0
let logs = []
const drops = Array(100).fill(0).map(() => Math.random() * innerHeight)
let lastSendAt = 0
let clickCooldownUntil = 0
let lastAckAt = 0
let idleStartAt = 0
let idleCenter = { x: gx, y: gy }
const IDLE_RADIUS = 24
const IDLE_LEFT_MS = 700
const IDLE_RIGHT_MS = 1400
const IDLE_COOLDOWN_MS = 900

function log(msg) {
  const t = new Date().toISOString().slice(11, 19)
  logs.push(`[${t}] ${msg}`)
  console.log(`[SENSE RAY] ${msg}`)
}

function resize() {
  const w = innerWidth
  const h = innerHeight
  const bg = document.getElementById("bg")
  const overlay = document.getElementById("overlay")
  bg.width = w
  bg.height = h
  overlay.width = w
  overlay.height = h
}
window.addEventListener("resize", resize)
resize()

proc.width = 80
proc.height = 60

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === "GAZE_ACK") lastAckAt = performance.now()
  })
}

function setProfile(p) {
  if (!PROFILES[p]) return
  currentProfile = p
  const pr = PROFILES[p]
  motionTh = pr.motionTh
  minCount = pr.minCount
  alphaBase = pr.alphaBase
  alphaMaxAdd = pr.alphaMaxAdd
  log(`RAYGUN PROFILE → ${pr.name}`)
}

function setTheme(t) {
  if (!THEMES[t]) return
  currentTheme = t
  log(`VISUAL THEME → ${THEMES[t].name}`)
}

function processFrame() {
  if (video.videoWidth === 0 || showCover) return
  pctx.drawImage(video, 0, 0, 80, 60)
  const data = pctx.getImageData(0, 0, 80, 60).data
  const gray = new Uint8ClampedArray(4800)
  let sum = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) | 0
    sum += gray[j]
  }
  fidx = (fidx + 1) % 3
  frames[fidx].set(gray)
  let sx = 0, sy = 0, count = 0
  const p = (fidx + 2) % 3
  const pp = (fidx + 1) % 3
  for (let i = 0; i < 4800; i++) {
    const diff = ((frames[fidx][i] ^ frames[p][i]) | (frames[p][i] ^ frames[pp][i])) & 0xf0
    if (diff > motionTh) {
      sx += i % 80
      sy += (i / 80) | 0
      count++
    }
  }
  if (count >= minCount) {
    targetX = (sx / count / 80) * innerWidth
    targetY = (sy / count / 60) * innerHeight
    targetX = innerWidth - targetX
    targetY = innerHeight - targetY
    confidence = Math.min(98, 48 + count * 2.1)
  } else {
    confidence = Math.max(20, confidence - 6)
  }
  if (sum / 4800 < 35) closedFrames++ 
  else closedFrames = 0

  const avgGray = sum / 4800
  irExposure = Math.floor(Math.max(8, Math.min(98, avgGray * 1.72)))
  isTraceRecording = (count >= minCount && confidence > 45)

  const dx = targetX - gx
  const dy = targetY - gy
  const dist = Math.hypot(dx, dy)
  const alpha = alphaBase + Math.min(alphaMaxAdd, dist * 0.0026)
  gx = gx * (1 - alpha) + targetX * alpha
  gy = gy * (1 - alpha) + targetY * alpha

  const now = performance.now()
  const shouldClick = closedFrames > 6 && now > clickCooldownUntil
  if (shouldClick) {
    clickCooldownUntil = now + 800
    closedFrames = 0
  }
  const dxIdle = gx - idleCenter.x
  const dyIdle = gy - idleCenter.y
  const distIdle = Math.hypot(dxIdle, dyIdle)
  if (distIdle > IDLE_RADIUS) {
    idleCenter = { x: gx, y: gy }
    idleStartAt = now
  }
  let idleClick = null
  if (now - idleStartAt > IDLE_RIGHT_MS && now > clickCooldownUntil) {
    idleClick = "right"
    clickCooldownUntil = now + IDLE_COOLDOWN_MS
    idleStartAt = now
  } else if (now - idleStartAt > IDLE_LEFT_MS && now > clickCooldownUntil) {
    idleClick = "left"
    clickCooldownUntil = now + IDLE_COOLDOWN_MS
    idleStartAt = now
  }
  const disconnected = now - lastAckAt > 2000
  if (now - lastSendAt > 33 && !disconnected) {
    lastSendAt = now
    const x = Math.max(0, Math.min(1, gx / innerWidth))
    const y = Math.max(0, Math.min(1, gy / innerHeight))
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GAZE_POS", payload: { x, y, click: shouldClick, idleClick } }, () => {})
    }
  }
  if (disconnected && now - lastSendAt > 500) {
    lastSendAt = now
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GAZE_PING" }, () => {})
    }
  }
  if (Math.random() < 0.7) {
    sparks.push({
      x: gx + (Math.random() - 0.5) * 24,
      y: gy + (Math.random() - 0.5) * 24,
      vx: (Math.random() - 0.5) * 3.8,
      vy: (Math.random() - 0.5) * 3.8,
      life: 22 + Math.random() * 12
    })
    if (sparks.length > 14) sparks.shift()
  }
}

function drawCover() {
  ctx.fillStyle = "rgba(5,5,15,0.96)"
  ctx.fillRect(0, 0, innerWidth, innerHeight)

  ctx.strokeStyle = "rgba(0,255,157,0.07)"
  ctx.lineWidth = 1
  for (let x = 40; x < innerWidth; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, innerHeight); ctx.stroke() }
  for (let y = 40; y < innerHeight; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerWidth, y); ctx.stroke() }

  ctx.shadowBlur = 40; ctx.shadowColor = "#00ff9d"; ctx.fillStyle = "#00ff9d"
  ctx.font = "bold 128px monospace"; ctx.textAlign = "center"
  ctx.fillText(PRODUCT, innerWidth / 2, innerHeight / 2 - 110)

  ctx.shadowBlur = 25; ctx.shadowColor = "#ffd700"; ctx.fillStyle = "#ffd700"
  ctx.font = "bold 48px monospace"
  ctx.fillText(TAGLINE, innerWidth / 2, innerHeight / 2 + 10)

  ctx.shadowBlur = 15; ctx.shadowColor = "#00ff41"; ctx.fillStyle = "#00ff41"
  ctx.font = "bold 34px monospace"
  ctx.fillText(SUBLINE, innerWidth / 2, innerHeight / 2 + 70)

  ctx.shadowBlur = 12; ctx.font = "19px monospace"
  ctx.fillStyle = currentProfile === 'ray1' ? "#ff00ff" : "#00ff9d"
  ctx.fillText("1  RAY-1 BLASTER", innerWidth / 2 - 280, innerHeight / 2 + 160)
  ctx.fillStyle = currentProfile === 'ray2' ? "#ff00ff" : "#00ff9d"
  ctx.fillText("2  RAY-2 PHASER", innerWidth / 2 - 80, innerHeight / 2 + 160)
  ctx.fillStyle = currentProfile === 'ray3' ? "#ff00ff" : "#00ff9d"
  ctx.fillText("3  RAY-3 SNIPER", innerWidth / 2 + 120, innerHeight / 2 + 160)

  ctx.fillStyle = "#00ff9d"
  ctx.fillText("4 MINIMAL   5 BALANCED   6 PERFORMANCE   7 FANCY", innerWidth / 2, innerHeight / 2 + 200)

  ctx.shadowBlur = 20; ctx.shadowColor = "#ffd700"; ctx.fillStyle = "#ffd700"
  ctx.font = "bold 21px monospace"
  ctx.fillText("♥ SUPPORT THIS REMUNERABLE PROJECT $", innerWidth / 2, innerHeight - 115)

  ctx.shadowBlur = 8; ctx.fillStyle = "#00ff9d"; ctx.font = "15px monospace"
  ctx.fillText("ko-fi.com / paypal.me / github sponsors", innerWidth / 2, innerHeight - 82)

  ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff"; ctx.font = "17px monospace"
  ctx.fillText("PRESS SPACE or CLICK TO ACTIVATE RAYGUN", innerWidth / 2, innerHeight - 38)
}

function drawGaze() {
  ctx.clearRect(0, 0, innerWidth, innerHeight)

  if (showCover) {
    drawCover()
    return
  }

  const theme = THEMES[currentTheme]
  const t = Date.now() / 240
  const tracePulse = isTraceRecording ? Math.sin(Date.now() / 70) * 0.4 + 1.35 : 1
  const bm = theme.blurMult

  // core raygun dot
  const pulse = Math.sin(Date.now() / 140) * 5 + 16 + confidence / 8
  ctx.shadowBlur = -1
  ctx.shadowColor = "#00ff9d"
  ctx.fillStyle = `rgba(0,255,157,${0.7 + confidence / 280})`
  ctx.beginPath()
  ctx.arc(gx, gy, pulse, 0, Math.PI * 2)
  ctx.fill()

  // === 8-LAYER DEEP NEURAL MNIST RETICLE ===
  const layerRadii = [112, 99, 86, 73, 59, 46, 33, 19]
  const layerWidths = [13, 8.5, 6.2, 4.8, 3.5, 2.9, 2.2, 4]
  const layerBlur  = [68, 52, 39, 29, 21, 16, 12, 9]
  const layerAlpha = [0.26, 0.55, 0.82, 0.95, 0.88, 0.72, 0.65, 1]

  for (let l = 0; l < 8; l++) {
    ctx.shadowBlur = layerBlur[l] * bm * tracePulse
    ctx.shadowColor = (l % 2 === 0) ? theme.color1 : theme.color2
    ctx.strokeStyle = `rgba(255,255,255,${layerAlpha[l]})`
    ctx.lineWidth = layerWidths[l]
    ctx.beginPath()
    ctx.arc(gx, gy, layerRadii[l], 0, Math.PI * 2)
    ctx.stroke()
  }

  // 58 orbiting MNIST neural nodes (scaled by theme)
  ctx.shadowBlur = 19 * bm * tracePulse
  ctx.shadowColor = "#ffffff"
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 15px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const mnistSyms = "0123456789ΦΨΔλ▒░▓█ΣΩ⊗⊕∇∞≈≠"
  for (let i = 0; i < theme.orbitCount; i++) {
    const layer = i % 8
    const radius = layerRadii[layer] - 6
    const speed = 0.7 + layer * 0.28
    const a = t * speed + i * (Math.PI * 2 / theme.orbitCount)
    const x = gx + Math.cos(a) * radius
    const y = gy + Math.sin(a) * radius
    ctx.fillText(mnistSyms[i % mnistSyms.length], x, y)
  }

  // Dynamic synapse connections (only when theme allows)
  if (theme.synapse) {
    ctx.shadowBlur = 8 * bm * tracePulse
    ctx.strokeStyle = isTraceRecording ? "rgba(255,0,136,0.85)" : "rgba(0,255,157,0.6)"
    ctx.lineWidth = 1.15
    for (let i = 0; i < theme.orbitCount; i += 4) {
      const a1 = t * 1.6 + i * 0.14
      const a2 = t * 2.3 + (i + 11) * 0.14
      const r1 = layerRadii[i % 8] - 8
      const r2 = layerRadii[(i + 3) % 8] - 8
      ctx.beginPath()
      ctx.moveTo(gx + Math.cos(a1) * r1, gy + Math.sin(a1) * r1)
      ctx.lineTo(gx + Math.cos(a2) * r2, gy + Math.sin(a2) * r2)
      ctx.stroke()
    }
  }

  // Pulsing neuron nodes
  ctx.shadowBlur = 24 * bm * tracePulse
  for (let i = 0; i < theme.pulses; i++) {
    const a = t * 3.2 + i * (Math.PI * 2 / theme.pulses)
    const nodePulse = Math.sin(t * 9 + i) * 2.5 + 4.5
    const r = layerRadii[i % 8] - 14
    const x = gx + Math.cos(a) * r
    const y = gy + Math.sin(a) * r
    ctx.fillStyle = isTraceRecording ? "#ff0088" : theme.color1
    ctx.fillRect(x - nodePulse/2, y - nodePulse/2, nodePulse, nodePulse)
  }

  // Classic raygun arms
  ctx.shadowBlur = -1
  ctx.shadowColor = "#00ff41"
  ctx.strokeStyle = "#00ff41"
  ctx.lineWidth = 5
  const r1 = 56 * Math.sin(t * 1.3)
  const r2 = 56 * Math.cos(t * 1.3)
  const r3 = 38 * Math.sin(t * 2.1)
  const r4 = 38 * Math.cos(t * 2.1)
  ctx.beginPath()
  ctx.moveTo(gx, gy); ctx.lineTo(gx + r1, gy + r2)
  ctx.moveTo(gx, gy); ctx.lineTo(gx - r2, gy + r1)
  ctx.stroke()

  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.moveTo(gx, gy); ctx.lineTo(gx + r3, gy + r4)
  ctx.moveTo(gx, gy); ctx.lineTo(gx - r4, gy + r3)
  ctx.stroke()

  // Target brackets
  ctx.strokeStyle = "#ffd700"
  ctx.lineWidth = 2.4
  ctx.shadowBlur = 14 * bm
  ctx.shadowColor = "#ffd700"
  ctx.beginPath()
  ctx.moveTo(gx - 26, gy - 26); ctx.lineTo(gx - 14, gy - 26); ctx.lineTo(gx - 14, gy - 14)
  ctx.moveTo(gx + 26, gy - 26); ctx.lineTo(gx + 14, gy - 26); ctx.lineTo(gx + 14, gy - 14)
  ctx.moveTo(gx - 26, gy + 26); ctx.lineTo(gx - 14, gy + 26); ctx.lineTo(gx - 14, gy + 14)
  ctx.moveTo(gx + 26, gy + 26); ctx.lineTo(gx + 14, gy + 26); ctx.lineTo(gx + 14, gy + 14)
  ctx.stroke()

  // RAYGUN HUD (left)
  ctx.shadowBlur = 14
  ctx.shadowColor = "#ffd700"
  ctx.fillStyle = "#ffd700"
  ctx.font = "bold 19px monospace"
  ctx.textAlign = "left"
  ctx.fillText(PROFILES[currentProfile].name, 38, 58)

  ctx.font = "13px monospace"
  ctx.fillStyle = "#00ff9d"
  ctx.fillText(`TH:${motionTh} MIN:${minCount}   ${THEMES[currentTheme].name}`, 38, 82)

  // IR EXPOSURE + TRACE RECORDING HUD (top-right)
  ctx.textAlign = "right"
  ctx.fillStyle = "#00ff9d"
  ctx.shadowBlur = 16
  ctx.shadowColor = isTraceRecording ? "#ff0088" : "#00ff9d"
  ctx.font = "bold 21px monospace"
  ctx.fillText("IR EXPOSURE", innerWidth - 48, 68)

  const barW = irExposure * 2.6
  ctx.fillStyle = isTraceRecording ? "#ff0088" : "#00ff9d"
  ctx.shadowBlur = 9
  ctx.fillRect(innerWidth - 260, 82, barW, 9)

  ctx.shadowBlur = 0
  ctx.font = "bold 17px monospace"
  ctx.fillStyle = "#ffffff"
  ctx.fillText(irExposure + "%", innerWidth - 48, 94)

  if (isTraceRecording) {
    ctx.shadowBlur = 22
    ctx.shadowColor = "#ff0088"
    ctx.fillStyle = "#ff0088"
    ctx.font = "bold 23px monospace"
    ctx.fillText("● TRACE REC", innerWidth - 48, 124)
  } else {
    ctx.shadowBlur = 8
    ctx.shadowColor = "#555"
    ctx.fillStyle = "#555"
    ctx.font = "bold 17px monospace"
    ctx.fillText("TRACE IDLE", innerWidth - 48, 124)
  }

  // sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    const a = s.life / 28
    ctx.shadowBlur = 14
    ctx.shadowColor = "#00ff9d"
    ctx.fillStyle = `rgba(0,255,157,${a})`
    ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5)
    s.x += s.vx
    s.y += s.vy
    s.life -= 1.2
    if (s.life <= 0) sparks.splice(i, 1)
  }
}

function rain() {
  bgctx.fillStyle = "rgba(10,10,20,0.10)"
  bgctx.fillRect(0, 0, innerWidth, innerHeight)
  bgctx.fillStyle = "#00ff9d"
  bgctx.font = "13px monospace"
  for (let i = 0; i < drops.length; i++) {
    let char = String.fromCharCode(0x30a0 + (Math.random() * 96) | 0)
    if (Math.random() < 0.11) char = '⚡'
    bgctx.fillText(char, i * 13, drops[i])
    if (drops[i] > innerHeight && Math.random() > 0.96) drops[i] = 0
    drops[i] += 12 + Math.random() * 4
  }
}

function start() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then((stream) => {
    video.srcObject = stream
    return video.play()
  }).catch(() => log("Camera access denied"))

  window.addEventListener('keydown', (e) => {
    if (showCover) {
      if (e.key === ' ' || e.key === 'Enter' || e.key >= '1' && e.key <= '7') {
        showCover = false
        log("RAYGUN EYE-POINTING ACTIVATED — TRACE RECORDING ENABLED")
      }
      if (e.key === '1') setProfile('ray1')
      if (e.key === '2') setProfile('ray2')
      if (e.key === '3') setProfile('ray3')
      if (e.key === '4') setTheme('minimal')
      if (e.key === '5') setTheme('balanced')
      if (e.key === '6') setTheme('performance')
      if (e.key === '7') setTheme('fancy')
    } else {
      if (e.key === '1') setProfile('ray1')
      if (e.key === '2') setProfile('ray2')
      if (e.key === '3') setProfile('ray3')
      if (e.key === '4') setTheme('minimal')
      if (e.key === '5') setTheme('balanced')
      if (e.key === '6') setTheme('performance')
      if (e.key === '7') setTheme('fancy')
      if (e.key === '+' || e.key === '=') { motionTh = Math.min(160, motionTh + 4); log(`TH ↑ ${motionTh}`) }
      if (e.key === '-' || e.key === '_') { motionTh = Math.max(50, motionTh - 4); log(`TH ↓ ${motionTh}`) }
    }
  })

  document.getElementById("overlay").addEventListener('click', () => {
    if (showCover) showCover = false
  })

  setInterval(processFrame, 33)
  setInterval(rain, 60)
  const drawLoop = () => {
    drawGaze()
    requestAnimationFrame(drawLoop)
  }
  drawLoop()
  setProfile('ray2')
  setTheme('balanced')
}

start()