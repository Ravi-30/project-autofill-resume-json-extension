// Background service worker
importScripts('resumeProcessor.js');

try {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }, () => {
      if (chrome.runtime.lastError) {
        console.error("SidePanel behavior error (ignorable):", chrome.runtime.lastError);
      }
    });
  }
} catch (e) {
  console.warn("SidePanel API not fully supported or error during init:", e);
}

// Track open side panels per window
const openSidePanelWindows = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    let windowId = null;

    port.onMessage.addListener((msg) => {
      if (msg.action === 'register_window' && msg.windowId) {
        windowId = msg.windowId;
        openSidePanelWindows.add(windowId);
      }
    });

    port.onDisconnect.addListener(() => {
      if (windowId) {
        openSidePanelWindows.delete(windowId);
      }
    });
  }
});
chrome.runtime.onInstalled.addListener(() => {

  chrome.contextMenus.create({
    id: "openSidePanel",
    title: "Open Side Panel",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "forceFillData",
    title: "Force Fill Data",
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "openSidePanel") {
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (info.menuItemId === "forceFillData") {
    // Retrieve resume data and send to content script
    chrome.storage.local.get(['resumeData', 'resumeFile'], (result) => {
      if (result.resumeData) {
        chrome.tabs.sendMessage(tab.id, {
          action: "fill_form",
          data: result.resumeData,
          normalizedData: ResumeProcessor.normalize(result.resumeData),
          resumeFile: result.resumeFile,
          manual: true
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log_fill') {
    logApplicationFill(request.data);
    sendResponse({ status: 'logged' });
  } else if (request.action === 'log_submission') {
    logApplicationSubmission(request.url);
    sendResponse({ status: 'updated' });
  } else if (request.action === 'check_sidepanel_status') {
    const windowId = sender.tab?.windowId;
    sendResponse({ isOpen: windowId ? openSidePanelWindows.has(windowId) : false });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'pong' });
  }
});

function logApplicationFill(data) {
  chrome.storage.local.get(['pendingSubmissions'], (result) => {
    let pending = result.pendingSubmissions || {};
    try {
      const hostname = new URL(data.url).hostname;
      pending[hostname] = { ...data, date: new Date().toISOString() };
      chrome.storage.local.set({ pendingSubmissions: pending });
    } catch (e) {
      console.error("AutoFill: Error parsing URL for pending submission:", e);
    }
  });
}

function logApplicationSubmission(url) {
  const hostname = new URL(url).hostname;
  chrome.storage.local.get(['applicationHistory', 'pendingSubmissions'], (result) => {
    let history = result.applicationHistory || [];
    let pending = result.pendingSubmissions || {};

    if (pending[hostname]) {
      const data = pending[hostname];

      // Prevent duplicate submissions for the same job in a short window
      const oneMinuteAgo = Date.now() - 60 * 1000;
      const isDuplicate = history.some(item =>
        item.url === data.url &&
        new Date(item.date).getTime() > oneMinuteAgo
      );

      if (!isDuplicate) {
        history.push({
          ...data,
          status: 'submitted',
          date: new Date().toISOString()
        });

        if (history.length > 50) history = history.slice(-50);
        chrome.storage.local.set({ applicationHistory: history });
      }

      // Clear pending for this host
      delete pending[hostname];
      chrome.storage.local.set({ pendingSubmissions: pending });
    }
  });
}



