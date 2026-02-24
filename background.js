chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("index.html")
  })
})
chrome.runtime.onMessage.addListener((m) => {
  if (!m || (m.type !== "GAZE_POS" && m.type !== "GAZE_PING")) return
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, m, () => {
        if (chrome.runtime.lastError) return
      })
    }
  })
})
