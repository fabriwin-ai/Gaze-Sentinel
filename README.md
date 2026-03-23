# BARRY METAL NEON SENTINEL - seL4 PROTOCOL

Real-time gaze-driven browser control extension with a camera processing page (`index.html` + `index.js`) and page-level overlay cursor (`content-script.js`).

## Project Structure

- `manifest.json`: Chrome extension manifest (MV3).
- `background.js`: opens the gaze page and forwards gaze events to the best active browser tab.
- `index.html`: camera processing and HUD page.
- `index.js`: gaze extraction, XOR motion logic, smoothing, HUD rendering, and runtime controls.
- `content-script.js`: in-page overlay cursor, move/click dispatch, overlay sizing.
- `shared.js`: shared helper constants/utilities.

## Actualizations (Detailed)

Last update: `2026-03-22`

### 1) Adaptive RAM + Motion Resolution

Implemented dynamic processing quality in `index.js`:

- Added memory-tier detection:
  - `navigator.deviceMemory` primary signal.
  - `performance.memory.jsHeapSizeLimit` fallback.
- Added resolution profiles (`low`, `mid`, `high`) with `idle` and `active` sizes.
- Added dynamic buffer allocator to safely recreate frame buffers on resolution changes.
- Added motion activity model + cooldown (`RESIZE_COOLDOWN_MS`) to keep transitions smooth.
- Added heap-pressure guard:
  - falls back to lower resolution when JS heap usage is high.

Key functions:

- `detectMemoryTier()`
- `selectResolutionProfile(tier)`
- `getHeapPressure()`
- `allocateProcessingBuffers(w, h)`
- `maybeAdjustProcessingResolution(count, effectiveMinCount)`
- `toggleDynamicResolution()`

### 2) Accuracy Scaling During Motion

`processFrame()` now scales detection logic with current frame resolution:

- Uses dynamic `procW`, `procH`, and `framePixels`.
- Scales minimum motion count with pixel ratio:
  - `effectiveMinCount = max(8, round(minCount * pixelScale))`
- Normalizes confidence by pixel scale, so confidence behavior stays consistent when resolution changes.
- Keeps contrast-enhanced grayscale processing and 3-frame XOR motion comparison.

### 3) Process Preview Overlay Improvements

In `index.js`:

- Process preview keeps motion in white and background in contrast grayscale.
- Preview window now auto-resizes to current processing resolution while remaining small and fixed on screen.
- Preview display hotkey:
  - `0` toggles preview.

### 4) Overlay Size Adjustment in Browser Pages

In `content-script.js`:

- Overlay cursor size can be adjusted on any page:
  - `Alt + [` or `Alt + -` decreases size.
  - `Alt + ]` or `Alt + +` increases size.
- Size is clamped and restyled dynamically (border and glow scale with size).

### 5) Cross-Window Forwarding + ACK Flow

In `background.js` and `content-script.js`:

- Gaze messages are forwarded to the active tab in the last focused browser window when possible.
- `GAZE_PING` / `GAZE_ACK` keepalive path exists to track connectivity.
- Content script acknowledges gaze updates and applies move/click actions.

### 6) Runtime Control Additions

In `index.js`:

- `9` toggles adaptive resolution ON/OFF.
- HUD now shows:
  - current processing resolution
  - dynamic mode state
  - memory tier

## Controls

From `index.js` gaze page:

- `Space` / `Enter`: activate gaze mode from cover.
- `1`, `2`, `3`: ray profiles.
- `4`, `5`, `6`, `7`: visual themes.
- `0`: process preview toggle.
- `9`: adaptive resolution toggle.
- `+` / `-`: motion threshold adjust.

From any browser page (`content-script.js`):

- `Alt + [` / `Alt + ]`: overlay size down/up.

## How To Run

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked" and select this folder.
4. Click extension action to open `index.html`.
5. Grant camera permission and start tracking.

## Notes

- Adaptive resolution depends on browser support for memory APIs.
- If `performance.memory` is unavailable, adaptive logic still works using motion signal and device memory fallback.
