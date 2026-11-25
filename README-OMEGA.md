# Kro-NOS Omega Neural Browser (experimental)

This branch integrates the existing Gaze-Sentinel camera page with an experimental Omega-SNNF field and a page-level control panel.

## Install
1. Download this branch as a ZIP and extract it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable Developer mode and choose **Load unpacked**.
4. Select the extracted repository folder.
5. Click the extension icon to open the existing Gaze-Sentinel camera page and grant camera permission.
6. On an ordinary HTTP(S) page, the Ω panel appears in the upper-right corner.

## Controls
- Panel buttons: pause/resume the field, explicitly enable/disable gaze-triggered click events, scroll, focus the current target, and clear episodic memory.
- `Alt+Shift+O`: toggle the panel.
- Existing sensor controls remain: 1/2/3 ray profiles, 4/5/6/7 themes, 0 process preview, 9 adaptive resolution.

## Architecture
- `omega-core.js`: 7x7 field, prediction residual, Omega familiarity heuristic, 24-event episodic memory, local plasticity and strict-prefix task admission.
- `omega-overlay.js`: DOM target classification, attention panel, field visualization and explicit controls.
- `content-script.js`: existing Gaze-Sentinel cursor and message bridge.

## Safety and limitations
- Gaze is treated as attention evidence, not consent. Gaze-triggered clicks are OFF by default and require an explicit toggle in the panel.
- Scroll, focus and memory-clear actions are explicit panel-button actions.
- Synthetic mouse events are not trusted user gestures and may not activate protected browser/app interactions.
- The existing sensor estimates motion from camera frames; it is not calibrated pupil/iris eye tracking.
- The field is a heuristic proof of concept, not a trained SNN, validated predictive-coding network, production scheduler, seL4 integration or energy-efficiency claim.
- The extension retains broad host access from the original project because its content overlay must observe page elements. Review permissions before installing.

## Research status
This implementation operationalizes the essay's simplified cycle: stimulus -> prediction -> residual -> familiarity -> topology/horizon -> admission -> episodic memory/local update. Costs are abstract units, not measured CPU time or energy. Results must be evaluated against baselines and adversarial/negative cases.
