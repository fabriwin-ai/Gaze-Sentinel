(function (global) {
  "use strict"

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  /**
   * ErrorMatrix: Tracks prediction error for each gaze target candidate.
   * Minimizes error by comparing predicted vs. actual user gaze outcomes.
   */
  class ErrorMatrix {
    constructor({ targetCount = 3, decayFactor = 0.08 } = {}) {
      this.targetCount = targetCount
      this.decayFactor = decayFactor
      this.errors = Array(targetCount).fill(0)
      this.hits = Array(targetCount).fill(0)
      this.samples = Array(targetCount).fill(0)
    }

    recordError(targetIndex, errorValue) {
      if (targetIndex < 0 || targetIndex >= this.targetCount) return

      // Exponential smoothing: old error weighted less as new errors arrive
      this.errors[targetIndex] = (this.errors[targetIndex] * (1 - this.decayFactor)) + (errorValue * this.decayFactor)
      this.samples[targetIndex] += 1
    }

    recordHit(targetIndex) {
      if (targetIndex < 0 || targetIndex >= this.targetCount) return
      this.hits[targetIndex] += 1
    }

    getMinimalErrorTarget() {
      let minError = Infinity
      let bestIndex = 0
      for (let i = 0; i < this.targetCount; i++) {
        if (this.errors[i] < minError) {
          minError = this.errors[i]
          bestIndex = i
        }
      }
      return bestIndex
    }

    getAccuracy(targetIndex) {
      if (this.samples[targetIndex] === 0) return 0
      return (this.hits[targetIndex] / this.samples[targetIndex]) * 100
    }

    getState() {
      return {
        errors: this.errors.slice(),
        hits: this.hits.slice(),
        samples: this.samples.slice(),
        minimalErrorTarget: this.getMinimalErrorTarget()
      }
    }
  }

  /**
   * PageSourceContainer: Stores page source metadata and gaze target mappings.
   * Each page source is a candidate container for gaze redirect decisions.
   */
  class PageSourceContainer {
    constructor(sourceId, sourceUrl) {
      this.sourceId = sourceId
      this.sourceUrl = sourceUrl
      this.interactionCount = 0
      this.dwellTime = 0
      this.lastInteractionAt = 0
      this.gazeProbability = 0
      this.errorMetric = 0
    }

    updateInteraction(dwellTimeMs) {
      this.interactionCount += 1
      this.dwellTime += dwellTimeMs
      this.lastInteractionAt = performance.now()
    }

    getAverageEngagement() {
      if (this.interactionCount === 0) return 0
      return this.dwellTime / this.interactionCount
    }

    getState() {
      return {
        sourceId: this.sourceId,
        sourceUrl: this.sourceUrl,
        interactionCount: this.interactionCount,
        dwellTime: this.dwellTime,
        avgEngagement: this.getAverageEngagement(),
        gazeProbability: this.gazeProbability,
        errorMetric: this.errorMetric
      }
    }
  }

  /**
   * ProbabilityHistoryTrace: Maintains user interaction history and derives probability distributions.
   */
  class ProbabilityHistoryTrace {
    constructor({ maxHistory = 32, windowSize = 8 } = {}) {
      this.maxHistory = maxHistory
      this.windowSize = windowSize
      this.trace = []
      this.timestamp = performance.now()
    }

    addSample(choice, confidence, error) {
      this.trace.push({
        choice,
        confidence: clamp(confidence, 0, 1),
        error: clamp(error, 0, 1),
        timestamp: performance.now()
      })

      if (this.trace.length > this.maxHistory) {
        this.trace.shift()
      }
    }

    computeChoiceProbability(choiceId) {
      const recentWindow = this.trace.slice(-this.windowSize)
      if (recentWindow.length === 0) return 0

      const matchingChoices = recentWindow.filter((entry) => entry.choice === choiceId)
      const avgConfidence = matchingChoices.length > 0
        ? matchingChoices.reduce((sum, entry) => sum + entry.confidence, 0) / matchingChoices.length
        : 0

      return clamp(avgConfidence, 0, 1)
    }

    getMostProbableChoice(choices = []) {
      let maxProb = -1
      let bestChoice = null

      for (const choice of choices) {
        const prob = this.computeChoiceProbability(choice)
        if (prob > maxProb) {
          maxProb = prob
          bestChoice = choice
        }
      }

      return { choice: bestChoice, probability: maxProb }
    }

    getFullDistribution(choices = []) {
      const dist = {}
      for (const choice of choices) {
        dist[choice] = this.computeChoiceProbability(choice)
      }
      return dist
    }

    getState() {
      return {
        traceLength: this.trace.length,
        windowSize: this.windowSize,
        recentSamples: this.trace.slice(-5)
      }
    }
  }

  /**
   * DecisionTreeGazeRouter: Routes gaze to the best target candidate using a decision tree
   * that minimizes error matrix and respects user probability history.
   */
  class DecisionTreeGazeRouter {
    constructor(config = {}) {
      this.containers = [] // Array of PageSourceContainer
      this.errorMatrix = new ErrorMatrix({
        targetCount: config.targetCount ?? 3,
        decayFactor: config.decayFactor ?? 0.08
      })
      this.history = new ProbabilityHistoryTrace({
        maxHistory: config.maxHistory ?? 32,
        windowSize: config.windowSize ?? 8
      })
      this.alpha = config.alpha ?? 0.6 // Weight for error vs history
      this.currentChoice = null
    }

    addContainer(sourceId, sourceUrl) {
      const container = new PageSourceContainer(sourceId, sourceUrl)
      this.containers.push(container)
      return container
    }

    /**
     * Evaluate three candidate targets and return the best one.
     * Decision is based on:
     * 1. Minimal error matrix score
     * 2. User probability history (most probable choice)
     * 3. Combined weighted score
     */
    decideBestTarget(gazeSignal, topN = 3) {
      if (this.containers.length === 0) {
        return { target: null, reason: "no_containers", confidence: 0 }
      }

      // Step 1: Score each container
      const scored = this.containers.map((container, idx) => {
        // Error-based score (minimize error)
        const errorScore = this.errorMatrix.errors[idx] ?? 0
        const errorNorm = clamp(errorScore / 1.0, 0, 1)

        // Probability-based score (maximize probability)
        const probScore = this.history.computeChoiceProbability(container.sourceId)

        // Combined weighted decision
        const decisionScore = (1 - this.alpha) * errorNorm + this.alpha * probScore

        return {
          container,
          index: idx,
          errorScore,
          probScore,
          decisionScore,
          engagement: container.getAverageEngagement()
        }
      })

      // Step 2: Sort by decision score (lower error + higher probability = better)
      scored.sort((a, b) => {
        // Prefer lower error score and higher probability
        return (a.decisionScore) - (b.decisionScore)
      })

      // Step 3: Return top N candidates
      const candidates = scored.slice(0, Math.min(topN, this.containers.length))

      // Step 4: Apply tree decision logic
      if (candidates.length === 0) {
        return { target: null, reason: "no_candidates", confidence: 0 }
      }

      const best = candidates[0]
      const confidence = clamp(1 - best.decisionScore, 0, 1)

      // Record this decision in history
      this.history.addSample(best.container.sourceId, confidence, best.errorScore)
      this.currentChoice = best.container.sourceId

      return {
        target: best.container,
        candidates: candidates.map((c) => ({
          sourceId: c.container.sourceId,
          sourceUrl: c.container.sourceUrl,
          errorScore: c.errorScore,
          probScore: c.probScore,
          decisionScore: c.decisionScore,
          rank: candidates.indexOf(c) + 1
        })),
        confidence,
        reason: "tree_decision\",
        chosenIndex: best.index
      }
    }

    /**
     * Update the decision tree with feedback on the last choice.\n     */\n    feedbackOnChoice(actualError, hitFlag = false) {\n      if (this.currentChoice === null) return\n\n      const idx = this.containers.findIndex((c) => c.sourceId === this.currentChoice)\n      if (idx === -1) return\n\n      this.errorMatrix.recordError(idx, actualError)\n      if (hitFlag) {\n        this.errorMatrix.recordHit(idx)\n      }\n    }\n\n    /**\n     * Get the three most probable choices based on user history.\n     */\n    getTopThreeProbable() {\n      const choices = this.containers.map((c) => c.sourceId)\n      const dist = this.history.getFullDistribution(choices)\n\n      const sorted = choices\n        .map((choice) => ({ choice, probability: dist[choice] }))\n        .sort((a, b) => b.probability - a.probability)\n        .slice(0, 3)\n\n      return sorted.map((item, rank) => ({\n        rank: rank + 1,\n        sourceId: item.choice,\n        probability: (item.probability * 100).toFixed(2) + \"%\",\n        container: this.containers.find((c) => c.sourceId === item.choice)\n      }))\n    }\n\n    /**\n     * Return comprehensive state for debugging and monitoring.\n     */\n    getState() {\n      return {\n        containerCount: this.containers.length,\n        errorMatrix: this.errorMatrix.getState(),\n        history: this.history.getState(),\n        topThreeProbable: this.getTopThreeProbable(),\n        currentChoice: this.currentChoice,\n        alpha: this.alpha,\n        containers: this.containers.map((c) => c.getState())\n      }\n    }\n  }\n\n  /**\n   * Factory function: Create a gaze router with preset configurations.\n   */\n  function createGazeRouter(config = {}) {\n    return new DecisionTreeGazeRouter(config)\n  }\n\n  const api = {\n    ErrorMatrix,\n    PageSourceContainer,\n    ProbabilityHistoryTrace,\n    DecisionTreeGazeRouter,\n    createGazeRouter\n  }\n\n  global.GazeSentinelDecisionTree = api\n})(typeof window !== \"undefined\" ? window : globalThis)\n