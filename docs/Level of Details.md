# Level of Details

## Purpose

This repository is a browser-based gaze-tracking extension. The requested addition introduces a lightweight JavaScript neural pipeline for gaze signal interpretation without depending on external ML packages.

The design adds three layers:

- Gradient descent optimization for dynamic memory exchange during the user iteration interval.
- A 4D spatial perceptron to map gaze vectors into a symbolic spatial-awareness output.
- A ReLU activation and recursive memory loop to keep the gaze estimate stable under noise and motion drift.

## Architectural intent

The current extension already performs frame differencing and gaze smoothing. The new neural path sits between raw per-frame target estimation and the final cursor smoothing stage.

The flow is:

1. Raw gaze sample is extracted from the camera frame.
2. The 4D spatial vector is converted to normalized coordinates and confidence metrics.
3. The perceptron produces a ReLU-activated scalar output.
4. Gradient descent updates the internal weight state using residual error.
5. Recursive memory keeps a rolling average of prior activations to suppress drift.
6. The final output is fed back into the current target coordinate model before the cursor is smoothed.

## Mathematical model

### 1) Gradient descent

Gradient descent minimizes error between the predicted gaze signal and the observed gaze sample.

Formula:

E = (target - activation)^2

Then the update rule is:

w_new = w_old - η * ∂E/∂w

In the implementation, the optimizer uses a momentum-adjusted variant:

v = m * v + (1 - m) * gradient
w_new = w_old - η * v * (1 - decay)

This is intended to stabilize the dynamic memory exchange during user interaction intervals.

### 2) 4D spatial perceptron

The perceptron takes a 4D gaze vector:

x, y, z, w

Where:

- x and y are normalized gaze-plane positions.
- z is the gaze confidence / signal strength.
- w is motion intensity or normalized activation density.

Weighted sum:

s = b + Σ(x_i * w_i)

Activation:

a = max(0, s)

The symbolic output is then:

- Ψ when activation is strong.
- Δ when activation is moderate.
- ∇ when activation is weak or negative.

### 3) ReLU

ReLU keeps only positive signal responses, which is useful when the gaze signal is noisy or partially occluded.

ReLU(x) = max(0, x)

This makes the gaze model robust by suppressing negative noise and preserving strong positive gaze evidence.

### 4) Recursive memory loop

A rolling memory term keeps the system from drifting when the user pauses or when low-confidence frames appear.

Memory residual:

r = a_current - avg(a_history)

Then the training target is adjusted:

target_adjusted = target + 0.35 * r

This recursively weighs past gaze activation states against fresh observations.

## Implementation summary

The JavaScript module is located at:

- `algorithms/gaze-neural-engine.js`

The module exposes:

- `GradientDescentOptimizer`
- `ReLUActivation`
- `FourDSpacePerceptron`
- `RecursiveGazeMemory`
- `buildGazeNeuralEngine`

The browser page loads it before `index.js` and binds it to `window.GazeSentinelAlgorithms`.

## Integration with the extension

The neural engine is integrated in `index.js` by processing the candidate gaze position and confidence before the final smoothing step.

The update call is conceptually:

neuralState = buildGazeNeuralEngine().processGazeSignal({
  x: normalizedX,
  y: normalizedY,
  z: confidenceSignal,
  w: motionSignal,
  confidence,
  count,
  maxCount
})

This returns a stabilized position and symbolic spatial signal for the outer quaternion-like layer of the gaze model.

## Notes

This is a from-scratch implementation designed for a browser extension. It is intentionally lightweight and deterministic so it can run without large dependencies while still approximating the requested neural behavior.

It is a symbolic and adaptive extension layer, not a full deep-learning stack.

## Suggested next iterations

- Add a configurable memory window.
- Add a training mode that stores gaze samples for offline calibration.
- Add a heatmap or confidence trace overlay for the neural gaze state.
- Expose settings in the extension UI for learning rate and memory depth.
