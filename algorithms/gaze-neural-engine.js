(function (global) {
  "use strict"

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  class GradientDescentOptimizer {
    constructor({ learningRate = 0.08, momentum = 0.14, decay = 0.0001 } = {}) {
      this.learningRate = learningRate
      this.momentum = momentum
      this.decay = decay
      this.velocity = 0
    }

    step(value, gradient) {
      const decayFactor = 1 - this.decay
      this.velocity = this.momentum * this.velocity + (1 - this.momentum) * gradient
      return (value - this.learningRate * this.velocity * decayFactor)
    }
  }

  class ReLUActivation {
    static forward(value) {
      return Math.max(0, value)
    }

    static backward(value) {
      return value > 0 ? 1 : 0
    }
  }

  class FourDSpacePerceptron {
    constructor({ weights = [0.38, 0.48, 0.62, 0.24], bias = 0.12, learningRate = 0.04 } = {}) {
      this.weights = weights.slice(0, 4)
      this.bias = bias
      this.learningRate = learningRate
    }

    normalizeInput(input) {
      if (Array.isArray(input)) {
        return input.slice(0, 4).map((entry, idx) => {
          if (idx === 0 || idx === 1) return clamp((entry ?? 0), -1, 1)
          return clamp((entry ?? 0), -1, 1)
        })
      }

      return [
        clamp((input.x ?? 0), -1, 1),
        clamp((input.y ?? 0), -1, 1),
        clamp((input.z ?? 0), -1, 1),
        clamp((input.w ?? 0), -1, 1)
      ]
    }

    forward(input) {
      const vector = this.normalizeInput(input)
      const weightedSum = vector.reduce((sum, value, index) => sum + value * this.weights[index], this.bias)
      const activation = ReLUActivation.forward(weightedSum)
      const symbolic = activation > 0.8 ? "Ψ" : activation > 0.45 ? "Δ" : "∇"
      return {
        vector,
        weightedSum,
        activation,
        symbolic,
        quaternionLike: [vector[0], vector[1], vector[2], vector[3]]
      }
    }

    train(input, target) {
      const output = this.forward(input)
      const error = target - output.activation
      const gradient = error * ReLUActivation.backward(output.activation)

      for (let i = 0; i < this.weights.length; i++) {
        this.weights[i] = this.weights[i] + this.learningRate * gradient * (output.vector[i] || 0)
      }

      this.bias = this.bias + this.learningRate * gradient
      return {
        output,
        error,
        gradient
      }
    }
  }

  class RecursiveGazeMemory {
    constructor({ maxHistory = 12, learningRate = 0.05, momentum = 0.12 } = {}) {
      this.maxHistory = maxHistory
      this.learningRate = learningRate
      this.momentum = momentum
      this.optimizer = new GradientDescentOptimizer({ learningRate, momentum })
      this.history = []
      this.iteration = 0
    }

    update(sample, target = 0.5) {
      const perceptron = new FourDSpacePerceptron({ learningRate: this.learningRate })
      const signal = perceptron.forward(sample)

      const memoryAverage = this.history.length
        ? this.history.reduce((total, item) => total + item.activation, 0) / this.history.length
        : signal.activation

      const residual = signal.activation - memoryAverage
      const gradient = (target - signal.activation) + (residual * 0.35)
      const optimized = this.optimizer.step(signal.activation, gradient)
      const reluValue = ReLUActivation.forward(optimized)

      this.history.push({ activation: reluValue, iteration: this.iteration })
      if (this.history.length > this.maxHistory) this.history.shift()

      this.iteration += 1

      return {
        activation: reluValue,
        memoryBias: residual,
        iteration: this.iteration,
        symbolic: signal.symbolic
      }
    }
  }

  function buildGazeNeuralEngine(config = {}) {
    const optimizer = new GradientDescentOptimizer({
      learningRate: config.learningRate ?? 0.08,
      momentum: config.momentum ?? 0.12,
      decay: config.decay ?? 0.0001
    })

    const perceptron = new FourDSpacePerceptron({
      weights: config.weights ?? [0.42, 0.58, 0.75, 0.19],
      bias: config.bias ?? 0.12,
      learningRate: config.perceptronRate ?? 0.04
    })

    const memory = []
    let iteration = 0

    return {
      processGazeSignal(sample = {}) {
        const vector = [
          clamp((sample.x ?? 0), -1, 1),
          clamp((sample.y ?? 0), -1, 1),
          clamp((sample.z ?? 0), -1, 1),
          clamp((sample.w ?? 0), -1, 1)
        ]

        const currentSignal = perceptron.forward(vector)
        const memoryAverage = memory.length
          ? memory.reduce((total, item) => total + item.activation, 0) / memory.length
          : currentSignal.activation

        const residual = currentSignal.activation - memoryAverage
        const confidenceTarget = clamp(((sample.confidence ?? 50) - 35) / 65, 0, 1)
        const motionTarget = clamp((sample.count ?? 0) / Math.max(1, sample.maxCount ?? 24), 0, 1)
        const target = clamp((confidenceTarget * 0.65) + (motionTarget * 0.35), 0, 1)
        const gradient = (target - currentSignal.activation) + residual * 0.4
        const optimized = optimizer.step(currentSignal.activation, gradient)
        const reluValue = ReLUActivation.forward(optimized)

        const filteredX = clamp(vector[0] * 0.65 + reluValue * 0.35, -1, 1)
        const filteredY = clamp(vector[1] * 0.65 + reluValue * 0.35, -1, 1)

        memory.push({ activation: reluValue, iteration })
        if (memory.length > 12) memory.shift()
        iteration += 1

        const output = {
          position: {
            x: clamp((filteredX + 1) / 2, 0, 1),
            y: clamp((filteredY + 1) / 2, 0, 1)
          },
          activation: reluValue,
          symbolic: currentSignal.symbolic,
          quaternion: [vector[0], vector[1], vector[2], vector[3]],
          memoryBias: residual,
          iteration: iteration - 1
        }

        return output
      },

      getState() {
        return {
          iteration,
          memoryLength: memory.length,
          memoryAverage: memory.length
            ? memory.reduce((total, item) => total + item.activation, 0) / memory.length
            : 0
        }
      }
    }
  }

  const api = {
    GradientDescentOptimizer,
    ReLUActivation,
    FourDSpacePerceptron,
    RecursiveGazeMemory,
    buildGazeNeuralEngine
  }

  global.GazeSentinelAlgorithms = api
})(typeof window !== "undefined" ? window : globalThis)
