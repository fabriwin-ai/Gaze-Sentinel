const video = document.getElementById("video")
const proc = document.getElementById("process")
const pctx = proc.getContext("2d", { willReadFrequently: true })

const BASE_FRAME_W = 80
const BASE_FRAME_H = 60
let procW = BASE_FRAME_W
let procH = BASE_FRAME_H
let framePixels = procW * procH

let frames = []
let motionPreview = null
let motionPreviewData = null
let enhancedGray = null
let fidx = 0

// Gaze point
let gx = innerWidth / 2
let gy = innerHeight / 2
let targetX = gx
let targetY = gy
let confidence = 60

// FIR + IIR smoothing for deterministic feel
const firBufferX = new Array(5).fill(gx)
const firBufferY = new Array(5).fill(gy)
let firIdx = 0
let smoothedX = gx
let smoothedY = gy

let motionTh = 89
let minCount = 18
let closedFrames = 0
let clickCooldownUntil = 0
let lastAckAt = 0
let idleStartAt = 0
let idleCenter = { x: gx, y: gy }
let lastSendAt = 0
let lastPingAt = 0

const IDLE_RADIUS = 18
const IDLE_LEFT_MS = 420
const IDLE_RIGHT_MS = 680
const IDLE_COOLDOWN_MS = 850
const MIN_CONFIDENCE = 62

let showProcessView = false
let showCover = false

// Adaptive resolution
const RESIZE_COOLDOWN_MS = 1200
let motionActivity = 0
let lastResolutionAdjustAt = 0
let runtimeDynamicResEnabled = true
let memoryTier = "mid"

const DYNAMIC_RES_PROFILES = {
  low:  { idle: { w: 64, h: 48 }, active: { w: 80, h: 60 } },
  mid:  { idle: { w: 80, h: 60 }, active: { w: 96, h: 72 } },
  high: { idle: { w: 96, h: 72 }, active: { w: 112, h: 84 } }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function log(msg) {
  console.log(`[SENSE RAY TRACKER] ${msg}`)
}

function detectMemoryTier() {
  if (navigator.deviceMemory) {
    return navigator.deviceMemory >= 8 ? "high" : navigator.deviceMemory >= 4 ? "mid" : "low"
  }
  if (performance?.memory?.jsHeapSizeLimit) {
    const heapMb = performance.memory.jsHeapSizeLimit / (1024*1024)
    return heapMb >= 2048 ? "high" : heapMb >= 1024 ? "mid" : "low"
  }
  return "mid"
}

function allocateProcessingBuffers(w, h) {
  procW = w; procH = h
  framePixels = procW * procH
  proc.width = procW; proc.height = procH
  frames = [
    new Uint8ClampedArray(framePixels),
    new Uint8ClampedArray(framePixels),
    new Uint8ClampedArray(framePixels)
  ]
  fidx = 0
  motionPreview = pctx.createImageData(procW, procH)
  motionPreviewData = motionPreview.data
  enhancedGray = new Uint8ClampedArray(framePixels)
}

memoryTier = detectMemoryTier()
allocateProcessingBuffers(80, 60)
log(`MEMORY TIER: ${memoryTier.toUpperCase()} | RES: ${procW}x${procH}`)

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(m => {
    if (m?.type === "GAZE_ACK") lastAckAt = performance.now()
  })
}

function processFrame() {
  if (video.videoWidth === 0 || showCover) return

  pctx.drawImage(video, 0, 0, procW, procH)
  const data = pctx.getImageData(0, 0, procW, procH).data

  let sum = 0, minGray = 255, maxGray = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = (data[i]*0.3 + data[i+1]*0.59 + data[i+2]*0.11) | 0
    enhancedGray[j] = g
    sum += g
    if (g < minGray) minGray = g
    if (g > maxGray) maxGray = g
  }

  const contrastRange = Math.max(16, maxGray - minGray)
  for (let i = 0; i < framePixels; i++) {
    const n = (enhancedGray[i] - minGray) / contrastRange
    enhancedGray[i] = clamp(Math.pow(clamp(n, 0, 1), 0.82) * 255 | 0, 0, 255)
  }

  fidx = (fidx + 1) % 3
  frames[fidx].set(enhancedGray)

  let sx = 0, sy = 0, count = 0
  const p = (fidx + 2) % 3
  const pp = (fidx + 1) % 3
  const adaptiveTh = clamp((motionTh * (0.76 + contrastRange / 255 * 0.36)) | 0, 40, 160)

  for (let i = 0, k = 0; i < framePixels; i++, k += 4) {
    const diff = ((frames[fidx][i] ^ frames[p][i]) | (frames[p][i] ^ frames[pp][i])) & 0xf0
    if (diff > adaptiveTh) {
      sx += i % procW
      sy += (i / procW) | 0
      count++
      motionPreviewData[k] = motionPreviewData[k+1] = motionPreviewData[k+2] = 255
      motionPreviewData[k+3] = 255
    } else {
      const bg = clamp(enhancedGray[i] * 0.45 | 0, 20, 180)
      motionPreviewData[k] = motionPreviewData[k+1] = motionPreviewData[k+2] = bg
      motionPreviewData[k+3] = 255
    }
  }
  pctx.putImageData(motionPreview, 0, 0)

  const pixelScale = framePixels / (BASE_FRAME_W * BASE_FRAME_H)
  const effectiveMin = Math.max(8, Math.round(minCount * pixelScale))

  if (count >= effectiveMin) {
    targetX = (sx / count / procW) * innerWidth
    targetY = (sy / count / procH) * innerHeight
    targetX = innerWidth - targetX
    targetY = innerHeight - targetY
    confidence = Math.min(98, 50 + (count / (effectiveMin * 0.6)) * 2.2)
  } else {
    confidence = Math.max(25, confidence - 7)
  }

  if (sum / framePixels < 38) closedFrames++ 
  else closedFrames = 0

  // FIR + IIR
  firBufferX[firIdx] = targetX
  firBufferY[firIdx] = targetY
  firIdx = (firIdx + 1) % 5
  const firAvgX = firBufferX.reduce((a,b) => a+b, 0) / 5
  const firAvgY = firBufferY.reduce((a,b) => a+b, 0) / 5

  const alpha = 0.28 + Math.min(0.55, Math.hypot(targetX - gx, targetY - gy) * 0.0018)
  smoothedX = smoothedX * (1 - alpha) + firAvgX * alpha
  smoothedY = smoothedY * (1 - alpha) + firAvgY * alpha
  gx = smoothedX
  gy = smoothedY

  const now = performance.now()
  const shouldClick = closedFrames > 6 && now > clickCooldownUntil
  if (shouldClick) {
    clickCooldownUntil = now + 14000
    closedFrames = 0
  }

  // Dwell clicks
  const isStable = confidence >= MIN_CONFIDENCE
  const distIdle = Math.hypot(gx - idleCenter.x, gy - idleCenter.y)
  if (distIdle > IDLE_RADIUS || !isStable) {
    idleCenter = { x: gx, y: gy }
    idleStartAt = now
  }

  let idleClick = null
  const dwellTime = now - idleStartAt
  if (isStable && dwellTime > IDLE_RIGHT_MS && now > clickCooldownUntil) {
    idleClick = "right"
    clickCooldownUntil = now + IDLE_COOLDOWN_MS
    idleStartAt = now
  } else if (isStable && dwellTime > IDLE_LEFT_MS && now > clickCooldownUntil) {
    idleClick = "left"
    clickCooldownUntil = now + IDLE_COOLDOWN_MS
    idleStartAt = now
  }

  // Edge scroll for YouTube
  let scroll = 0
  if (gy < innerHeight * 0.16) scroll = -22
  else if (gy > innerHeight * 0.84) scroll = 22

  const dwellProgress = isStable ? Math.min(1, dwellTime / IDLE_LEFT_MS) : 0
  const isTrace = count >= effectiveMin && confidence > 45

  // Send to content script
  if (now - lastSendAt > 16) {
    lastSendAt = now
    const x = clamp(gx / innerWidth, 0, 1)
    const y = clamp(gy / innerHeight, 0, 1)

    chrome?.runtime?.sendMessage({
      type: "GAZE_POS",
      payload: {
        x, y,
        click: shouldClick,
        idleClick,
        scroll,
        dwellProgress,
        trace: isTrace,
        confidence
      }
    })
  }

  if (now - lastAckAt > 2200 && now - lastPingAt > 600) {
    lastPingAt = now
    chrome?.runtime?.sendMessage({ type: "GAZE_PING" })
  }
}

function start() {
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: "user", width: {ideal: 640}, height: {ideal: 480} }
  }).then(stream => {
    video.srcObject = stream
    video.play().catch(() => {})
  }).catch(() => log("Camera access denied"))

  window.addEventListener('keydown', e => {
    if (e.key === '1') motionTh = Math.max(50, motionTh - 6)
    if (e.key === '2') motionTh = Math.min(160, motionTh + 6)
    if (e.key === '0') {
      showProcessView = !showProcessView
      proc.style.display = showProcessView ? "block" : "none"
    }
    if (e.key === 'Escape') showCover = !showCover
  })

  // Main loop - edge friendly
  const loop = () => {
    processFrame()
    requestAnimationFrame(loop)
  }
  loop()

  log("Tracker ready — aesthetic overlay active on tabs")
}

start()