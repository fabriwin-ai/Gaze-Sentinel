(function (global) {
  "use strict"

  /**
   * GazeDecisionRestAPI: HTTP REST endpoint interface for controlling decision modes
   * and keystroke bindings dynamically. Exposed via a local HTTP server or WebSocket.
   */
  class GazeDecisionRestAPI {
    constructor(controller, config = {}) {
      this.controller = controller
      this.port = config.port ?? 8765
      this.bindings = {
        toggleAutoMode: "ctrl+d",
        navigateNext: "arrowdown",
        navigatePrev: "arrowup",
        toggleOverlay: "ctrl+g",
        recordHit: "enter",
        recordMiss: "backspace"
      }
      this.requestLog = []
      this.maxLogs = 100
    }

    /**
     * Handle incoming REST request.
     * Supports GET, POST, and PUT methods for different operations.
     */
    handleRequest(method, path, body = null) {
      const timestamp = new Date().toISOString()
      const request = { method, path, timestamp, status: 200, response: null }

      try {
        if (method === "GET") {
          if (path === "/api/status") {
            request.response = this.getStatus()
          } else if (path === "/api/bindings") {
            request.response = this.getBindings()
          } else if (path === "/api/state") {
            request.response = this.controller.getState()
          } else if (path === "/api/top-three") {
            request.response = this.controller.router.getTopThreeProbable()
          } else {
            request.status = 404
            request.response = { error: "Not found" }
          }
        } else if (method === "POST") {
          if (path === "/api/bindings/update") {
            request.response = this.updateBindings(body)
          } else if (path === "/api/mode/toggle") {
            request.response = this.toggleMode()
          } else if (path === "/api/feedback") {
            request.response = this.recordFeedback(body)
          } else if (path === "/api/keystroke/trigger") {
            request.response = this.triggerKeystroke(body)
          } else {
            request.status = 404
            request.response = { error: "Not found" }
          }
        } else if (method === "PUT") {
          if (path === "/api/bindings") {
            request.response = this.replaceBindings(body)
          } else if (path.startsWith("/api/bindings/")) {
            const bindingKey = path.split("/").pop()
            request.response = this.updateBinding(bindingKey, body.keystroke)
          } else {
            request.status = 404
            request.response = { error: "Not found" }
          }
        } else {
          request.status = 405
          request.response = { error: "Method not allowed" }
        }
      } catch (err) {
        request.status = 500
        request.response = { error: err.message }
      }

      this.logRequest(request)
      return request
    }

    /**
     * Get current API status and mode.
     */
    getStatus() {
      return {
        status: "active",
        mode: this.controller.autoMode ? "auto" : "manual",
        timestamp: new Date().toISOString(),
        bindings: this.bindings,
        containerCount: this.controller.router.containers.length
      }
    }

    /**
     * Get all current keystroke bindings.
     */
    getBindings() {
      return {
        bindings: this.bindings,
        timestamp: new Date().toISOString()
      }
    }

    /**
     * Update a single keystroke binding.
     * Example: PUT /api/bindings/toggleAutoMode { keystroke: "alt+m" }
     */
    updateBinding(bindingKey, keystroke) {
      if (!this.bindings.hasOwnProperty(bindingKey)) {
        throw new Error(`Unknown binding: ${bindingKey}`)
      }

      const oldKeystroke = this.bindings[bindingKey]
      this.bindings[bindingKey] = keystroke.toLowerCase()

      console.log(`[GAZE API] Binding updated: ${bindingKey} from '${oldKeystroke}' to '${this.bindings[bindingKey]}'`)

      return {
        success: true,
        bindingKey,
        oldKeystroke,
        newKeystroke: this.bindings[bindingKey]
      }
    }

    /**
     * Update multiple keystroke bindings at once.
     * Example: POST /api/bindings/update { toggleAutoMode: "alt+a", toggleOverlay: "alt+o" }
     */
    updateBindings(newBindings = {}) {
      const updated = {}
      const errors = []

      for (const key in newBindings) {
        if (this.bindings.hasOwnProperty(key)) {
          const oldVal = this.bindings[key]
          this.bindings[key] = newBindings[key].toLowerCase()
          updated[key] = { old: oldVal, new: this.bindings[key] }
          console.log(`[GAZE API] ${key}: '${oldVal}' → '${this.bindings[key]}'`)
        } else {
          errors.push(`Unknown binding: ${key}`)
        }
      }

      return {
        success: errors.length === 0,
        updated,
        errors: errors.length > 0 ? errors : undefined
      }
    }

    /**
     * Replace all keystroke bindings with a new set.
     * Example: PUT /api/bindings { toggleAutoMode: "alt+a", ... }
     */
    replaceBindings(newBindings = {}) {
      const oldBindings = { ...this.bindings }
      this.bindings = newBindings

      console.log(`[GAZE API] All bindings replaced`)

      return {
        success: true,
        oldBindings,
        newBindings: this.bindings
      }
    }

    /**
     * Toggle between auto (tree) and manual mode.
     * POST /api/mode/toggle
     */
    toggleMode() {
      this.controller.toggleAutoMode()
      return {
        success: true,
        newMode: this.controller.autoMode ? "auto" : "manual",
        timestamp: new Date().toISOString()
      }
    }

    /**
     * Record feedback on the current decision.
     * POST /api/feedback { hitFlag: true, errorValue: 0.15 }
     */
    recordFeedback(feedback = {}) {
      const { hitFlag = false, errorValue = 0 } = feedback

      if (this.controller.router.currentChoice) {
        this.controller.router.feedbackOnChoice(errorValue, hitFlag)
      }

      return {
        success: true,
        feedback: { hitFlag, errorValue },
        currentChoice: this.controller.router.currentChoice
      }
    }

    /**
     * Trigger a keystroke action programmatically.
     * POST /api/keystroke/trigger { action: "toggleAutoMode" }
     */
    triggerKeystroke(data = {}) {
      const action = data.action || ""

      switch (action) {
        case "toggleAutoMode":
          this.controller.toggleAutoMode()
          break
        case "navigateNext":
          if (!this.controller.autoMode) {
            this.controller.manualChoiceIndex = (this.controller.manualChoiceIndex + 1) % 3
            this.controller.applyManualChoice()
          }
          break
        case "navigatePrev":
          if (!this.controller.autoMode) {
            this.controller.manualChoiceIndex = (this.controller.manualChoiceIndex - 1 + 3) % 3
            this.controller.applyManualChoice()
          }
          break
        case "toggleOverlay":
          this.controller.overlay.setVisible(!this.controller.overlay.visible)
          break
        case "recordHit":
          this.recordFeedback({ hitFlag: true, errorValue: 0 })
          break
        case "recordMiss":
          this.recordFeedback({ hitFlag: false, errorValue: 0.5 })
          break
        default:
          return { success: false, error: `Unknown action: ${action}` }
      }

      return { success: true, action, timestamp: new Date().toISOString() }
    }

    /**
     * Log request for debugging and audit trail.
     */
    logRequest(request) {
      this.requestLog.push(request)
      if (this.requestLog.length > this.maxLogs) {
        this.requestLog.shift()
      }
    }

    /**
     * Get request history.
     */
    getRequestLog() {
      return {
        logs: this.requestLog.slice(),
        count: this.requestLog.length
      }
    }

    /**
     * Export API documentation.
     */
    getDocumentation() {
      return {
        title: "Gaze Sentinel Decision API",
        baseURL: `http://localhost:${this.port}`,
        endpoints: [
          {
            method: "GET",
            path: "/api/status",
            description: "Get current API status and mode"
          },
          {
            method: "GET",
            path: "/api/bindings",
            description: "Get all keystroke bindings"
          },
          {
            method: "GET",
            path: "/api/state",
            description: "Get full controller state"
          },
          {
            method: "GET",
            path: "/api/top-three",
            description: "Get top 3 probable choices"
          },
          {
            method: "POST",
            path: "/api/bindings/update",
            description: "Update one or more keystroke bindings",
            body: { toggleAutoMode: "alt+a" }
          },
          {
            method: "PUT",
            path: "/api/bindings",
            description: "Replace all keystroke bindings",
            body: { toggleAutoMode: "alt+a", toggleOverlay: "alt+o" }
          },
          {
            method: "PUT",
            path: "/api/bindings/:bindingKey",
            description: "Update a single binding",
            body: { keystroke: "alt+m" }
          },
          {
            method: "POST",
            path: "/api/mode/toggle",
            description: "Toggle between auto and manual mode"
          },
          {
            method: "POST",
            path: "/api/feedback",
            description: "Record feedback on current decision",
            body: { hitFlag: true, errorValue: 0.1 }
          },
          {
            method: "POST",
            path: "/api/keystroke/trigger",
            description: "Trigger an action programmatically",
            body: { action: "toggleAutoMode" }
          }
        ]
      }
    }
  }

  /**
   * Factory to create REST API instance.
   */
  function createGazeDecisionAPI(controller, config = {}) {
    return new GazeDecisionRestAPI(controller, config)
  }

  const api = {
    GazeDecisionRestAPI,
    createGazeDecisionAPI
  }

  global.GazeSentinelRestAPI = api
})(typeof window !== "undefined" ? window : globalThis)
