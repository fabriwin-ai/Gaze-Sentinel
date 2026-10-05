(function (global) {
  "use strict"

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  /**
   * EnhancedPageSourceContainer: Extended to track proximate page links and their probabilities.
   * Each container can reference the next most probable linked target across the three choices.
   */
  class EnhancedPageSourceContainer {
    constructor(sourceId, sourceUrl, title = "") {
      this.sourceId = sourceId
      this.sourceUrl = sourceUrl
      this.title = title || sourceUrl.split("/").pop() || "page"
      this.interactionCount = 0
      this.dwellTime = 0
      this.lastInteractionAt = 0
      this.gazeProbability = 0
      this.errorMetric = 0

      // New: Track proximate links and their decision probabilities
      this.proximateLinks = [] // Array of { linkId, linkTitle, linkUrl, probability }
      this.nextProbableLink = null // The most probable linked target
      this.probabilityChain = [] // Chain of probabilities across containers
    }

    /**
     * Add a proximate link from this container to another page/element.
     */
    addProximateLink(linkId, linkTitle, linkUrl, initialProbability = 0) {
      const link = {
        linkId,
        linkTitle: linkTitle || linkUrl.split("/").pop() || "link",
        linkUrl,
        probability: clamp(initialProbability, 0, 1),
        hitCount: 0,
        missCount: 0
      }
      this.proximateLinks.push(link)
      this.updateNextProbableLink()
      return link
    }

    /**
     * Update which link is the most probable next target.
     */
    updateNextProbableLink() {
      if (this.proximateLinks.length === 0) {
        this.nextProbableLink = null
        return
      }

      let maxProb = -1
      let bestLink = null
      for (const link of this.proximateLinks) {
        if (link.probability > maxProb) {
          maxProb = link.probability
          bestLink = link
        }
      }
      this.nextProbableLink = bestLink
    }

    /**
     * Record feedback on a link (hit or miss).
     */
    recordLinkFeedback(linkId, wasHit = false) {
      const link = this.proximateLinks.find((l) => l.linkId === linkId)
      if (!link) return

      if (wasHit) {
        link.hitCount += 1
        link.probability = Math.min(1, link.probability + 0.1)
      } else {
        link.missCount += 1
        link.probability = Math.max(0, link.probability - 0.08)
      }

      this.updateNextProbableLink()
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

    /**
     * Build probability chain: this container -> its next probable link -> linked target.
     * Used for rendering the "three-level" decision hierarchy.
     */
    buildProbabilityChain(maxDepth = 3) {
      const chain = [
        {
          level: 1,
          sourceId: this.sourceId,
          title: this.title,
          url: this.sourceUrl,
          probability: this.gazeProbability,
          type: "container"
        }
      ]

      if (this.nextProbableLink && maxDepth > 1) {
        chain.push({
          level: 2,
          sourceId: this.nextProbableLink.linkId,
          title: this.nextProbableLink.linkTitle,
          url: this.nextProbableLink.linkUrl,
          probability: this.nextProbableLink.probability,
          type: "link"
        })
      }

      return chain
    }

    getState() {
      return {
        sourceId: this.sourceId,
        sourceUrl: this.sourceUrl,
        title: this.title,
        interactionCount: this.interactionCount,
        dwellTime: this.dwellTime,
        avgEngagement: this.getAverageEngagement(),
        gazeProbability: this.gazeProbability,
        errorMetric: this.errorMetric,
        proximateLinks: this.proximateLinks.slice(),
        nextProbableLink: this.nextProbableLink
          ? {
              linkId: this.nextProbableLink.linkId,
              linkTitle: this.nextProbableLink.linkTitle,
              linkUrl: this.nextProbableLink.linkUrl,
              probability: (this.nextProbableLink.probability * 100).toFixed(1) + "%"
            }
          : null,
        probabilityChain: this.buildProbabilityChain()
      }
    }
  }

  /**
   * EnhancedDecisionTreeGazeRouter: Extends the decision tree to include
   * proximate link tracking and multi-level probability chains.
   */
  class EnhancedDecisionTreeGazeRouter {
    constructor(config = {}) {
      this.containers = [] // Array of EnhancedPageSourceContainer
      this.alpha = config.alpha ?? 0.6
      this.maxHistory = config.maxHistory ?? 32
      this.history = []
      this.currentChoice = null
    }

    addContainer(sourceId, sourceUrl, title = "") {
      const container = new EnhancedPageSourceContainer(sourceId, sourceUrl, title)
      this.containers.push(container)
      return container
    }

    /**
     * Get a container by ID for adding proximate links.
     */
    getContainer(sourceId) {
      return this.containers.find((c) => c.sourceId === sourceId)
    }

    /**
     * Compute probability for a container based on history.
     */
    computeContainerProbability(containerId) {
      const recentWindow = this.history.slice(-8)
      if (recentWindow.length === 0) return 0

      const matches = recentWindow.filter((entry) => entry.choice === containerId)
      if (matches.length === 0) return 0

      const avgConf = matches.reduce((sum, entry) => sum + entry.confidence, 0) / matches.length
      return clamp(avgConf, 0, 1)
    }

    /**
     * Decide best target and include next probable links in the response.
     */
    decideBestTarget(gazeSignal, topN = 3) {
      if (this.containers.length === 0) {
        return { target: null, reason: "no_containers", confidence: 0 }
      }

      // Score and rank containers
      const scored = this.containers.map((container, idx) => {
        const prob = this.computeContainerProbability(container.sourceId)
        container.gazeProbability = prob
        const errorNorm = clamp(container.errorMetric / 1.0, 0, 1)
        const decisionScore = (1 - this.alpha) * errorNorm + this.alpha * prob

        return {
          container,
          index: idx,
          probability: prob,
          decisionScore,
          errorMetric: container.errorMetric
        }
      })

      scored.sort((a, b) => b.probability - a.probability)
      const candidates = scored.slice(0, Math.min(topN, this.containers.length))

      if (candidates.length === 0) {
        return { target: null, reason: "no_candidates", confidence: 0 }
      }

      const best = candidates[0]
      const confidence = clamp(best.probability, 0, 1)

      this.history.push({
        choice: best.container.sourceId,
        confidence,
        timestamp: performance.now()
      })

      if (this.history.length > this.maxHistory) {
        this.history.shift()
      }

      this.currentChoice = best.container.sourceId

      // Build enriched response with next probable links for each top choice
      const enrichedCandidates = candidates.map((cand, rank) => {
        const probChain = cand.container.buildProbabilityChain(3)
        return {
          rank: rank + 1,
          sourceId: cand.container.sourceId,
          title: cand.container.title,
          sourceUrl: cand.container.sourceUrl,
          probability: (cand.probability * 100).toFixed(1) + "%",
          probabilityValue: cand.probability,
          errorMetric: cand.errorMetric.toFixed(3),
          nextProbableLink: cand.container.nextProbableLink
            ? {
                linkId: cand.container.nextProbableLink.linkId,
                linkTitle: cand.container.nextProbableLink.linkTitle,
                linkUrl: cand.container.nextProbableLink.linkUrl,
                probability: (cand.container.nextProbableLink.probability * 100).toFixed(1) + "%"
              }
            : null,
          probabilityChain: probChain,
          container: cand.container
        }
      })

      return {
        target: best.container,
        candidates: enrichedCandidates,
        confidence,
        reason: "tree_decision",
        chosenIndex: best.index
      }
    }

    /**
     * Get top 3 with next probable links included.
     */
    getTopThreeProbable() {
      const choices = this.containers.map((c) => ({
        sourceId: c.sourceId,
        title: c.title,
        url: c.sourceUrl,
        probability: this.computeContainerProbability(c.sourceId),
        container: c
      }))

      choices.sort((a, b) => b.probability - a.probability)

      return choices.slice(0, 3).map((choice, rank) => ({
        rank: rank + 1,
        sourceId: choice.sourceId,
        title: choice.title,
        sourceUrl: choice.url,
        probability: (choice.probability * 100).toFixed(1) + "%",
        probabilityValue: choice.probability,
        nextProbableLink: choice.container.nextProbableLink
          ? {
              linkId: choice.container.nextProbableLink.linkId,
              linkTitle: choice.container.nextProbableLink.linkTitle,
              linkUrl: choice.container.nextProbableLink.linkUrl,
              probability: (choice.container.nextProbableLink.probability * 100).toFixed(1) + "%"
            }
          : null,
        container: choice.container
      }))
    }

    getState() {
      return {
        containerCount: this.containers.length,
        topThreeProbable: this.getTopThreeProbable(),
        currentChoice: this.currentChoice,
        historyLength: this.history.length
      }
    }
  }

  /**
   * EnhancedGazeDecisionOverlay: Renders top 3 containers with their next probable links.
   */
  class EnhancedGazeDecisionOverlay {
    constructor(canvasElement) {
      this.canvas = canvasElement
      this.ctx = canvasElement.getContext("2d")
      this.visible = false
      this.topChoices = []
    }

    setVisible(flag) {
      this.visible = flag
      this.canvas.style.display = flag ? "block" : "none"
    }

    updateChoices(topThree = []) {
      this.topChoices = topThree
    }

    render() {
      if (!this.visible) return

      const w = this.canvas.width
      const h = this.canvas.height
      const ctx = this.ctx

      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)"
      ctx.fillRect(0, 0, w, h)

      // Title
      ctx.fillStyle = "#00ff9d"
      ctx.font = "bold 18px monospace"
      ctx.textAlign = "left"
      ctx.fillText("GAZE DECISION TREE — TOP 3 TARGETS + NEXT PROBABLE LINKS", 20, 40)

      // Divider
      ctx.strokeStyle = "#00ff9d"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(20, 55)
      ctx.lineTo(w - 20, 55)
      ctx.stroke()

      let yOffset = 85

      for (let i = 0; i < Math.min(3, this.topChoices.length); i++) {
        const choice = this.topChoices[i]
        const rankColors = ["#ff00ff", "#ffd700", "#00ff41"]
        const rankColor = rankColors[i] || "#ffffff"

        // === RANK HEADER ===
        ctx.fillStyle = rankColor
        ctx.font = "bold 14px monospace"
        ctx.fillText(`#${choice.rank}`, 30, yOffset)

        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 12px monospace"
        ctx.fillText(choice.title || choice.sourceId, 80, yOffset)

        ctx.fillStyle = rankColor
        ctx.font = "bold 18px monospace"
        ctx.textAlign = "right"
        ctx.fillText(choice.probability, w - 40, yOffset)
        ctx.textAlign = "left"

        yOffset += 22

        // Container URL
        ctx.fillStyle = "#888888"
        ctx.font = "11px monospace"
        const urlDisplay = choice.sourceUrl.substring(0, 70)
        ctx.fillText("→ " + urlDisplay, 80, yOffset)
        yOffset += 16

        // === NEXT PROBABLE LINK ===
        if (choice.nextProbableLink) {
          ctx.fillStyle = rankColor
          ctx.font = "bold 11px monospace"
          ctx.fillText("↳ NEXT: ", 85, yOffset)

          ctx.fillStyle = "#ffffff"
          ctx.font = "11px monospace"
          const linkTitleDisplay = choice.nextProbableLink.linkTitle.substring(0, 45)
          ctx.fillText(linkTitleDisplay, 145, yOffset)

          ctx.fillStyle = rankColor
          ctx.font = "bold 11px monospace"
          ctx.textAlign = "right"
          ctx.fillText(choice.nextProbableLink.probability, w - 40, yOffset)
          ctx.textAlign = "left"

          yOffset += 16

          // Link URL
          ctx.fillStyle = "#666666"
          ctx.font = "10px monospace"
          const linkUrlDisplay = choice.nextProbableLink.linkUrl.substring(0, 65)
          ctx.fillText("    " + linkUrlDisplay, 85, yOffset)
          yOffset += 14
        } else {
          ctx.fillStyle = "#555555"
          ctx.font = "10px monospace"
          ctx.fillText("↳ No probable next link", 85, yOffset)
          yOffset += 14
        }

        // Progress bar
        const probValue = choice.probabilityValue ?? 0
        const barW = (w - 140) * probValue
        const barX = 80
        const barY = yOffset + 2
        const barH = 10

        ctx.fillStyle = "rgba(" + (rankColor === "#ff00ff" ? "255,0,255" : rankColor === "#ffd700" ? "255,215,0" : "0,255,65") + ",0.25)"
        ctx.fillRect(barX, barY, w - 140, barH)

        ctx.fillStyle = rankColor
        ctx.fillRect(barX, barY, barW, barH)

        ctx.strokeStyle = rankColor
        ctx.lineWidth = 1
        ctx.strokeRect(barX, barY, w - 140, barH)

        yOffset += 30
      }

      // Footer
      ctx.fillStyle = "#00ff9d"
      ctx.font = "10px monospace"
      ctx.textAlign = "left"
      ctx.fillText("Ctrl+D: Toggle auto/manual | Arrows: Navigate | Ctrl+G: Toggle overlay", 20, h - 20)
    }
  }

  /**
   * Factory: Create enhanced router and overlay.
   */
  function createEnhancedGazeSystem(config = {}) {
    const router = new EnhancedDecisionTreeGazeRouter(config)

    let overlayCanvas = document.getElementById("gaze-decision-overlay-enhanced")
    if (!overlayCanvas && typeof document !== "undefined") {
      overlayCanvas = document.createElement("canvas")
      overlayCanvas.id = "gaze-decision-overlay-enhanced"
      overlayCanvas.style.position = "fixed"
      overlayCanvas.style.top = "0"
      overlayCanvas.style.left = "0"
      overlayCanvas.style.zIndex = "2147483645"
      overlayCanvas.style.display = "none"
      overlayCanvas.width = window.innerWidth
      overlayCanvas.height = window.innerHeight
      document.body.appendChild(overlayCanvas)

      window.addEventListener("resize", () => {
        overlayCanvas.width = window.innerWidth
        overlayCanvas.height = window.innerHeight
      })
    }

    const overlay = overlayCanvas ? new EnhancedGazeDecisionOverlay(overlayCanvas) : null

    return {
      router,
      overlay,
      getState: () => router.getState()
    }
  }

  const api = {
    EnhancedPageSourceContainer,
    EnhancedDecisionTreeGazeRouter,
    EnhancedGazeDecisionOverlay,
    createEnhancedGazeSystem
  }

  global.GazeSentinelEnhancedRouter = api
})(typeof window !== "undefined" ? window : globalThis)
