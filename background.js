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
    chrome.storage.local.get(['resumeData', 'aiEnabled', 'resumeFile'], (result) => {
      if (result.resumeData) {
        chrome.tabs.sendMessage(tab.id, {
          action: "fill_form",
          data: result.resumeData,
          normalizedData: ResumeProcessor.normalize(result.resumeData),
          aiEnabled: result.aiEnabled || false,
          resumeFile: result.resumeFile,
          manual: true
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // AI Handlers Removed
  /*
  if (request.action === "generate_ai_answer") {
    ...
  }
  */

  // --- Auto-Apply Queue Logic ---
  if (request.action === 'start_queue') {
    startAutoApplyQueue(request.jobs);
    sendResponse({ status: 'started' });
  } else if (request.action === 'stop_queue') {
    stopAutoApplyQueue();
    sendResponse({ status: 'stopped' });
  } else if (request.action === 'next_job' || request.action === 'advance_queue') {
    advanceQueue();
    sendResponse({ status: 'advancing' });
  } else if (request.action === 'log_fill') {
    logApplicationFill(request.data);
    sendResponse({ status: 'logged' });
  } else if (request.action === 'log_submission') {
    logApplicationSubmission(request.url);
    sendResponse({ status: 'updated' });
    // AI Cover Letter Handler Removed
    // } else if (request.action === 'generate_cover_letter') {
    //   ...
    // }
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

// --- Auto-Apply State & Functions ---
let jobQueue = [];
let currentIndex = 0;
let autoRunActive = false;
let activeJobTabId = null;
let isOpeningJob = false; // Lock to prevent multiple tabs opening at once

function startAutoApplyQueue(jobs) {
  if (!jobs || jobs.length === 0) return;

  // Cleanup any old state before starting fresh
  if (activeJobTabId) {
    chrome.tabs.remove(activeJobTabId, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
    activeJobTabId = null;
  }

  jobQueue = jobs;
  currentIndex = 0;
  autoRunActive = true;
  isOpeningJob = false;

  chrome.storage.local.set({
    autoRunActive: true,
    currentJobIndex: currentIndex,
    totalJobs: jobQueue.length,
    jobQueue: jobQueue,
    lastSubmittedUrl: null
  }, () => {
    broadcastQueueStatus();
    openCurrentJob();
  });
}

// Reload state on startup to handle service worker restarts
chrome.storage.local.get(['autoRunActive', 'currentJobIndex', 'jobQueue'], (result) => {
  if (result.autoRunActive && result.jobQueue) {
    autoRunActive = true;
    jobQueue = result.jobQueue;
    currentIndex = result.currentJobIndex || 0;
  }
});

function stopAutoApplyQueue() {
  autoRunActive = false;
  isOpeningJob = false;
  chrome.storage.local.set({ autoRunActive: false }, () => {
    broadcastQueueStatus('stopped');
  });
}

function advanceQueue() {
  if (!autoRunActive) return;

  currentIndex++;

  if (currentIndex >= jobQueue.length) {
    // Queue finished
    autoRunActive = false;
    isOpeningJob = false;

    // Attempt to close last tab
    if (activeJobTabId) {
      chrome.tabs.remove(activeJobTabId, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
      activeJobTabId = null;
    }

    chrome.storage.local.set({ autoRunActive: false }, () => {
      broadcastQueueStatus('completed');
    });
  } else {
    // Open next job
    chrome.storage.local.set({ currentJobIndex: currentIndex, lastSubmittedUrl: null }, () => {
      broadcastQueueStatus();
      openCurrentJob();
    });
  }
}

function openCurrentJob() {
  // console.log("openCurrentJob called. autoRunActive:", autoRunActive, "currentIndex:", currentIndex);
  if (!autoRunActive || !jobQueue || currentIndex >= jobQueue.length) {
    console.warn("Cannot open job: queue inactive, index out of bounds, or queue empty. Length:", jobQueue?.length);
    return;
  }

  if (isOpeningJob) {
    // console.log("AutoFill: Already opening a job, skipping duplicate request.");
    return;
  }

  isOpeningJob = true;

  const job = jobQueue[currentIndex];
  let jobUrl = typeof job === 'string' ? job : (job.url || "");
  jobUrl = jobUrl.replace(/[\n\r]/g, "").trim();

  if (!jobUrl || !jobUrl.startsWith('http')) {
    console.error("Invalid job URL:", jobUrl);
    isOpeningJob = false;
    advanceQueue();
    return;
  }

  // console.log("Opening job:", jobUrl);
  chrome.tabs.create({ url: jobUrl, active: true }, (tab) => {
    isOpeningJob = false; // Release lock
    if (chrome.runtime.lastError) {
      console.error("Failed to open tab:", chrome.runtime.lastError.message);
      advanceQueue();
      return;
    }
    activeJobTabId = tab.id;
  });
}

function broadcastQueueStatus(overrideStatus = null) {
  try {
    chrome.runtime.sendMessage({
      action: 'queue_status_update',
      data: {
        status: overrideStatus || (autoRunActive ? 'running' : 'stopped'),
        currentIndex: currentIndex,
        totalJobs: jobQueue.length
      }
    }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  } catch (err) {
    console.error("Broadcast failed:", err);
  }
}

// --- AI Generation Functions Removed ---
