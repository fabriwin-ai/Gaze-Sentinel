# BARRY METAL NEON SENTINEL - seL4 PROTOCOL

Real-time gaze-driven browser control extension with a camera processing page (`index.html` + `index.js`) and page-level overlay cursor (`content-script.js`).

## Project Structure

- `manifest.json`: Chrome extension manifest (MV3).
- `background.js`: opens the gaze page and forwards gaze events to the best active browser tab.
- `index.html`: camera processing and HUD page.
- `index.js`: gaze extraction, XOR motion logic, smoothing, HUD rendering, and runtime controls.
- `content-script.js`: in-page overlay cursor, move/click dispatch, overlay sizing.
- `shared.js`: shared helper constants/utilities.
- `algorithms/`: neural and decision-tree logic for gaze routing and protocol control.
  - `gaze-neural-engine.js`: gradient descent + 4D perceptron + ReLU recursive memory.
  - `decision-tree-gaze-router.js`: minimal error matrix and probability history selection.
  - `enhanced-decision-router.js`: top-3 page-source ranking, next-link estimation, and probability chain output.
  - `gaze-tab-controller.js`: active tab/source tracking plus debug decision overlay.
  - `gaze-decision-rest-api.js`: REST control API for switching mode and keystroke bindings.

## Decision-Tree Gaze Routing

The repository now includes a decision-layer that redirects gaze attention to the best page-source container using a minimal-error matrix and historical user-probability trace.

### Ranking model

Each page-source container is compared using:

- minimal error score from the error matrix
- historical probability of the user selecting that source
- the next probable link/proximate target within the same container
- weighted ranking of the best three candidates

This produces a ranked order of the top three possible targets, displayed as percentages.

### Example decision chain

1. Source page container: current active page context
2. Next probable link: most likely proximate page target within that container
3. Final choice: ranked candidate among the top three source paths

The system selects the lowest error path while keeping user history and probable transitions in view.

## Control Modes

The decision layer supports two modes:

- `AUTO` tree mode: hardcoded decision-making based on error matrix + probability history
- `MANUAL` mode: user-controlled selection via keyboard navigation

### Keyboard bindings

- `Ctrl + D`: toggle auto/manual decision mode
- `Arrow Up / Arrow Left`: move to previous choice
- `Arrow Down / Arrow Right`: move to next choice
- `Ctrl + G`: toggle decision overlay
- `Enter`: record a hit / accepted decision
- `Backspace`: record a miss / rejected decision

## REST API Control

The repository includes a lightweight control API module for dynamic protocol switching and keystroke changes.

### Useful endpoints

- `GET /api/status`: get current mode and status
- `GET /api/bindings`: list current keystroke bindings
- `GET /api/top-three`: read the current top three probable page-source choices
- `POST /api/mode/toggle`: switch between auto and manual decision mode
- `POST /api/feedback`: record hit or miss against the selected choice
- `POST /api/bindings/update`: update one or more bindings
- `PUT /api/bindings/:bindingKey`: override a single key binding

Example payload:

```json
{
  "toggleAutoMode": "alt+a",
  "toggleOverlay": "alt+o",
  "navigateNext": "arrowright"
}
```

## Overlay Debug Output

The decision overlay reports the top three source candidates as percentages with:

- source title
- source URL
- next most probable link title and URL
- weighted probability percentage
- error estimate

This is intended to help monitor the minimal error path and the highest-probability user-selection history.

## Actualizations (Detailed)

Last update: `2026-10-05`

### 1) Adaptive RAM + Motion Resolution

Implemented dynamic processing quality in `index.js`:

- Added memory-tier detection
- Added resolution profiles (`low`, `mid`, `high`)
- Added buffer resizing and recoil protection
- Added motion activity and heap-pressure fallback

### 2) Neural Gaze Signal Processing

The neural layer in `algorithms/gaze-neural-engine.js` adds:

- gradient descent optimizer
- 4D spatial perceptron
- ReLU activation filtering
- recursive memory stabilizer

### 3) Decision-Tree Routing

The routing layer in `algorithms/enhanced-decision-router.js` adds:

- page-source containers
- minimal-error matrix scoring
- probability history trace
- top-three ranking and next probable link evaluation

### 4) Active Source Tracking + Overlay

The control layer in `algorithms/gaze-tab-controller.js` adds:

- active tab monitoring
- page-source collection
- decision overlay for the top three choices
- manual vs. auto switching logic

### 5) REST Control Protocol

The control API in `algorithms/gaze-decision-rest-api.js` enables:

- protocol switching between decision methods
- dynamic key binding changes
- event logging of mode and decision feedback

## Controls

From `index.js` gaze page:

- `Space` / `Enter`: activate gaze mode from cover
- `1`, `2`, `3`: ray profiles
- `4`, `5`, `6`, `7`: visual themes
- `0`: process preview toggle
- `9`: adaptive resolution toggle
- `+` / `-`: motion threshold adjust
- `Ctrl + D`: toggle auto/manual decision tree
- `Ctrl + G`: show/hide decision overlay

From any browser page (`content-script.js`):

- `Alt + [` / `Alt + ]`: overlay size down/up

## How To Run

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked" and select this folder.
4. Click the extension action to open `index.html`.
5. Grant camera permission and start tracking.
6. Switch between auto and manual decision modes as needed.

## Notes

- Adaptive resolution depends on browser support for memory APIs.
- The decision and neural layers are intentionally lightweight and browser-safe.
- The architecture is designed as a deterministic from-scratch model rather than a dependency-heavy ML stack.
- The system aims to balance low-error target selection with learned probability history and page-source context.
