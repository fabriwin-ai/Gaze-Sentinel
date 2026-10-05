(function (global) {
  "use strict"

  /**
   * ActiveTabMonitor: Tracks active browser tabs and page sources.
   * Integrates with Chrome extension APIs to feed page sources into the decision tree.
   */
  class ActiveTabMonitor {
    constructor() {
      this.activeTabs = new Map() // sourceId -> { url, title, faviconUrl, lastActive }
      this.currentActiveTab = null
      this.isExtensionContext = typeof chrome !== "undefined" && chrome.tabs
    }

    registerTab(sourceId, url, title = "", faviconUrl = "") {
      const existing = this.activeTabs.get(sourceId) || {}
      this.activeTabs.set(sourceId, {
        sourceId,
        url,
        title: title || url,
        faviconUrl: faviconUrl || "",
        interactionCount: (existing.interactionCount ?? 0),
        lastActive: performance.now(),
        dwellMs: 0
      })
    }

    setActiveTab(sourceId) {
      if (this.currentActiveTab !== null) {
        const prev = this.activeTabs.get(this.currentActiveTab)
        if (prev) {
          const now = performance.now()
          if (prev.lastActive) {
            prev.dwellMs += (now - prev.lastActive)
          }
        }
      }

      this.currentActiveTab = sourceId
      const tab = this.activeTabs.get(sourceId)
      if (tab) {
        tab.lastActive = performance.now()
        tab.interactionCount += 1
      }
    }

    getActiveTabs() {
      return Array.from(this.activeTabs.values())
    }

    getCurrentTab() {
      if (this.currentActiveTab === null) return null
      return this.activeTabs.get(this.currentActiveTab)
    }

    getState() {
      return {
        totalTabs: this.activeTabs.size,
        currentActiveTab: this.currentActiveTab,
        tabs: this.getActiveTabs()
      }
    }
  }

  /**
   * GazeDecisionOverlay: Renders a debug HUD showing the top 3 decision tree choices
   * as percentages, error scores, and interaction counts.
   */
  class GazeDecisionOverlay {
    constructor(canvasElement) {
      this.canvas = canvasElement
      this.ctx = canvasElement.getContext("2d")
      this.visible = false
      this.topChoices = []
      this.decisionState = {}
    }

    setVisible(flag) {
      this.visible = flag
      this.canvas.style.display = flag ? "block" : "none"
    }

    updateChoices(topThree = []) {
      this.topChoices = topThree
    }

    updateState(state = {}) {
      this.decisionState = state
    }

    render() {
      if (!this.visible) return

      const w = this.canvas.width
      const h = this.canvas.height
      const ctx = this.ctx

      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)"
      ctx.fillRect(0, 0, w, h)

      // Title
      ctx.fillStyle = "#00ff9d"
      ctx.font = "bold 18px monospace"
      ctx.textAlign = "left"
      ctx.fillText("GAZE DECISION TREE — TOP 3 CHOICES", 20, 40)

      // Subtitle
      ctx.font = "12px monospace"
      ctx.fillStyle = "#888888"
      ctx.fillText("Decision mode: " + (this.decisionState.autoMode ? "AUTO (TREE)" : "MANUAL"), 20, 58)

      // Divider
      ctx.strokeStyle = "#00ff9d"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(20, 70)
      ctx.lineTo(w - 20, 70)
      ctx.stroke()

      // Render each of the 3 choices
      let yOffset = 100
      const choiceHeight = 90

      for (let i = 0; i < Math.min(3, this.topChoices.length); i++) {
        const choice = this.topChoices[i]
        const rank = choice.rank || (i + 1)

        // Rank indicator (1st, 2nd, 3rd)
        const rankColors = ["#ff00ff", "#ffd700", "#00ff41"]
        const rankColor = rankColors[i] || "#ffffff"

        ctx.fillStyle = rankColor
        ctx.font = "bold 16px monospace"
        ctx.fillText(`#${rank}`, 30, yOffset)

        // Container/source info
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 13px monospace"
        ctx.fillText((choice.container?.sourceUrl || choice.sourceId || "unknown").substring(0, 50), 80, yOffset)

        // Probability percentage (big)
        const probStr = choice.probability || "0%"
        ctx.fillStyle = rankColor
        ctx.font = "bold 22px monospace"
        ctx.textAlign = "right"
        ctx.fillText(probStr, w - 40, yOffset)

        // Error score and engagement
        ctx.fillStyle = "#888888"
        ctx.font = "11px monospace"
        ctx.textAlign = "left"
        ctx.fillText(`Error: ${(choice.errorScore || 0).toFixed(3)} | Engagement: ${(choice.container?.getAverageEngagement?.() || 0).toFixed(0)}ms`, 80, yOffset + 22)

        // Progress bar (visual probability)
        const probValue = parseFloat(probStr) / 100
        const barW = (w - 120) * probValue
        const barX = 80
        const barY = yOffset + 35
        const barH = 12

        ctx.fillStyle = "rgba(" + (rankColor === "#ff00ff" ? "255,0,255" : rankColor === "#ffd700" ? "255,215,0" : "0,255,65") + ",0.3)"
        ctx.fillRect(barX, barY, w - 120, barH)

        ctx.fillStyle = rankColor
        ctx.fillRect(barX, barY, barW, barH)

        ctx.strokeStyle = rankColor
        ctx.lineWidth = 1
        ctx.strokeRect(barX, barY, w - 120, barH)

        yOffset += choiceHeight
      }

      // Footer info
      ctx.fillStyle = "#00ff9d"
      ctx.font = "11px monospace"
      ctx.textAlign = "left"
      ctx.fillText(`Total containers: ${this.decisionState.containerCount || 0} | History samples: ${this.decisionState.history?.traceLength || 0}`, 20, h - 20)
    }
  }

  /**
   * GazeDecisionController: Bridges the decision tree, active tab monitor, and overlay.
   * Handles keyboard controls for manual vs. automatic (tree) decision mode.
   */
  class GazeDecisionController {
    constructor(router, tabMonitor, overlay) {
      this.router = router
      this.tabMonitor = tabMonitor
      this.overlay = overlay

      this.autoMode = true // true = tree decision, false = manual control
      this.manualChoiceIndex = 0
      this.lastDecisionAt = 0
      this.decisionInterval = 200 // ms between tree decisions

      this.setupKeyboardBindings()
    }

    setupKeyboardBindings() {
      if (typeof document === "undefined") return

      document.addEventListener("keydown", (e) => {
        // Hotkey to toggle decision mode
        if (e.key === "d" && e.ctrlKey) {
          e.preventDefault()
          this.toggleAutoMode()
        }

        // If manual mode, use arrow keys to cycle through the 3 choices
        if (!this.autoMode) {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault()
            this.manualChoiceIndex = (this.manualChoiceIndex + 1) % 3
            this.applyManualChoice()
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault()
            this.manualChoiceIndex = (this.manualChoiceIndex - 1 + 3) % 3
            this.applyManualChoice()
          }
        }

        // Hotkey to show/hide overlay
        if (e.key === "g" && e.ctrlKey) {
          e.preventDefault()
          this.overlay.setVisible(!this.overlay.visible)
        }
      })
    }

    toggleAutoMode() {
      this.autoMode = !this.autoMode
      const modeStr = this.autoMode ? "AUTO (TREE)" : "MANUAL"
      console.log(`[GAZE DECISION] Mode switched to ${modeStr}`)
      this.logToOverlay(`Mode: ${modeStr}`)
    }

    applyManualChoice() {
      const topThree = this.router.getTopThreeProbable()
      if (this.manualChoiceIndex < topThree.length) {
        const choice = topThree[this.manualChoiceIndex]
        this.tabMonitor.setActiveTab(choice.sourceId)
        console.log(`[GAZE DECISION] Manual choice: ${choice.sourceId} (rank ${choice.rank})`)
      }
    }

    /**
     * Process gaze signal and decide the best target.
     * If autoMode is true, use the tree decision. Otherwise, use manual selection.
     */
    processGazeSignal(gazeSignal) {
      const now = performance.now()
      if (now - this.lastDecisionAt < this.decisionInterval) return null

      this.lastDecisionAt = now

      if (this.autoMode) {
        // Tree-based automatic decision
        const decision = this.router.decideBestTarget(gazeSignal, 3)
        if (decision.target) {
          this.tabMonitor.setActiveTab(decision.target.sourceId)
        }
        return decision
      } else {
        // Manual mode: return current manual selection
        const topThree = this.router.getTopThreeProbable()
        if (this.manualChoiceIndex < topThree.length) {
          return {
            target: topThree[this.manualChoiceIndex].container,
            mode: "manual",
            choice: this.manualChoiceIndex + 1
          }
        }
      }

      return null
    }

    /**
     * Update overlay with latest state.
     */
    updateOverlay() {
      const topThree = this.router.getTopThreeProbable()
      this.overlay.updateChoices(topThree)
      this.overlay.updateState(this.router.getState())
      this.overlay.render()
    }

    logToOverlay(message) {
      console.log(`[GAZE DECISION OVERLAY] ${message}`)
    }

    getState() {
      return {
        autoMode: this.autoMode,
        manualChoiceIndex: this.manualChoiceIndex,
        activeTabs: this.tabMonitor.getState(),
        decision: this.router.getState()
      }
    }
  }

  /**
   * Factory to create and bind all components together.
   */
  function createGazeDecisionSystem(config = {}) {
    // Assume these are imported from the other modules:
    // - GazeSentinelDecisionTree.DecisionTreeGazeRouter

    const router = new (global.GazeSentinelDecisionTree?.DecisionTreeGazeRouter || function() {})()
    const tabMonitor = new ActiveTabMonitor()

    // Create or reuse overlay canvas
    let overlayCanvas = document.getElementById("gaze-decision-overlay")
    if (!overlayCanvas) {
      overlayCanvas = document.createElement("canvas")
      overlayCanvas.id = "gaze-decision-overlay"
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

    const overlay = new GazeDecisionOverlay(overlayCanvas)
    const controller = new GazeDecisionController(router, tabMonitor, overlay)

    return {
      router,
      tabMonitor,
      overlay,
      controller,
      getState: () => controller.getState()
    }
  }

  const api = {
    ActiveTabMonitor,
    GazeDecisionOverlay,
    GazeDecisionController,
    createGazeDecisionSystem
  }

  global.GazeSentinelTabController = api
})(typeof window !== "undefined" ? window : globalThis)
