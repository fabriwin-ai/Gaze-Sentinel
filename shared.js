window.GazeShared = (() => {
  const MODE = { NEUTRAL: "NEUTRAL", OBSCURE: "OBSCURE", LIGHT: "LIGHT" }
  const MSG = { SENSOR_FRAME: "SENSOR_FRAME", MODE_UPDATE: "MODE_UPDATE", TRIGGER_OBSCURE_CLICK: "TRIGGER_OBSCURE_CLICK", PREFS_UPDATE: "PREFS_UPDATE", CALIBRATION_SET: "CALIBRATION_SET", STATUS: "STATUS" }
  function clampInt(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
  function nowQuantized(ms) { const t = performance.now(); const q = ms; const n = Math.floor(t / q) * q; return n }
  function codeFromSensors(s) { const a = s[0] ? 1 : 0; const b = s[1] ? 1 : 0; const c = s[2] ? 1 : 0; return (a << 2) | (b << 1) | c }
  function newRing(size) { return { buf: new Uint8Array(size), head: 0, count: 0, size } }
  function pushRing(r, code) { r.buf[r.head] = code; r.head = (r.head + 1) % r.size; if (r.count < r.size) r.count++ }
  function histogram(r) { const h = new Uint16Array(8); for (let i = 0; i < r.count; i++) { h[r.buf[i]]++ } return h }
  function l1(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s }
  function deterministicPick(scores) { let bestKey = null; let bestVal = Number.MAX_SAFE_INTEGER; const order = [MODE.OBSCURE, MODE.LIGHT, MODE.NEUTRAL]; for (const k of order) { const v = scores[k]; if (v < bestVal) { bestVal = v; bestKey = k } } return bestKey }
  function defaultPrefs() { return { windowSize: 24, margin: 12, minStableWindows: 2, sampleRateHz: 50, sensitivity: 1, cameraEnabled: true, blockClicksInLight: true, showHud: true } }
  function defaultCalib() { const z = new Uint16Array(8); return { [MODE.NEUTRAL]: z.slice(), [MODE.OBSCURE]: z.slice(), [MODE.LIGHT]: z.slice() } }
  function reduceState(state, sensors, prefs) {
    const code = codeFromSensors(sensors)
    pushRing(state.window, code)
    const h = histogram(state.window)
    const s = {
      [MODE.NEUTRAL]: l1(h, state.calibration[MODE.NEUTRAL]),
      [MODE.OBSCURE]: l1(h, state.calibration[MODE.OBSCURE]),
      [MODE.LIGHT]: l1(h, state.calibration[MODE.LIGHT])
    }
    const pick = deterministicPick(s)
    const stable = state.lastPick === pick ? state.stableCount + 1 : 1
    let mode = state.mode
    let trigger = false
    if (stable >= prefs.minStableWindows) {
      if (pick === MODE.OBSCURE) {
        if (state.mode !== MODE.OBSCURE) trigger = true
        mode = MODE.OBSCURE
      } else if (pick === MODE.LIGHT) {
        mode = MODE.LIGHT
      } else {
        mode = MODE.NEUTRAL
      }
    }
    return { mode, trigger, lastPick: pick, stableCount: stable, window: state.window, calibration: state.calibration, lastSampleAt: nowQuantized(5) }
  }
  function newDeterministicState(calibration, prefs) { return { mode: MODE.NEUTRAL, trigger: false, lastPick: MODE.NEUTRAL, stableCount: 0, window: newRing(prefs.windowSize), calibration, lastSampleAt: 0 } }
  function missingDataFailSafe(state, prefs) { const t = nowQuantized(5); if (t - state.lastSampleAt > 200) { return { ...state, mode: MODE.NEUTRAL, trigger: false } } return state }
  return { MODE, MSG, clampInt, nowQuantized, codeFromSensors, newRing, pushRing, histogram, l1, deterministicPick, defaultPrefs, defaultCalib, reduceState, newDeterministicState, missingDataFailSafe }
})()
if (typeof self !== "undefined") self.GazeShared = GazeShared
if (typeof window !== "undefined") window.GazeShared = GazeShared
