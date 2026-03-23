chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("index.html")
  })
})

function isBrowserPage(tab) {
  if (!tab || !tab.id || !tab.url) return false
  return tab.url.startsWith("http://") ||
    tab.url.startsWith("https://") ||
    tab.url.startsWith("file://")
}

function forwardToBestBrowserTab(message) {
  chrome.windows.getLastFocused({ populate: true }, (win) => {
    const focusedActive = win && win.tabs
      ? win.tabs.find((tab) => tab.active && isBrowserPage(tab))
      : null

    if (focusedActive && focusedActive.id) {
      chrome.tabs.sendMessage(focusedActive.id, message, () => {
        if (chrome.runtime.lastError) return
      })
      return
    }

    chrome.tabs.query({ active: true }, (tabs) => {
      const fallback = tabs.find((tab) => isBrowserPage(tab))
      if (!fallback || !fallback.id) return
      chrome.tabs.sendMessage(fallback.id, message, () => {
        if (chrome.runtime.lastError) return
      })
    })
  })
}

chrome.runtime.onMessage.addListener((m) => {
  if (!m || (m.type !== "GAZE_POS" && m.type !== "GAZE_PING")) return
  forwardToBestBrowserTab(m)
})
