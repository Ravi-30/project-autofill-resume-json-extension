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
chrome.runtime.onInstalled.addListener(() => {
  // console.log("Extension installed");

  chrome.contextMenus.create({
    id: "generateAIAnswer",
    title: "Generate Answer with AI",
    contexts: ["editable"]
  });

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
  if (info.menuItemId === "generateAIAnswer") {
    chrome.tabs.sendMessage(tab.id, { action: "get_question_text" });
  } else if (info.menuItemId === "openSidePanel") {
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
  if (request.action === "generate_ai_answer") {
    callOllama(request.prompt).then(result => {
      sendResponse({ text: result });
    });
    return true;
  }

  // --- Auto-Apply Queue Logic ---
  if (request.action === 'start_queue') {
    startAutoApplyQueue(request.jobs);
    sendResponse({ status: 'started' });
  } else if (request.action === 'stop_queue') {
    stopAutoApplyQueue();
    sendResponse({ status: 'stopped' });
  } else if (request.action === 'next_job') {
    advanceQueue();
    sendResponse({ status: 'advancing' });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'pong' });
  }
});

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
    // console.log("Queue successfully saved to storage. Total jobs:", jobQueue.length);
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
    // console.log("Resuming queue from storage at index", currentIndex);
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

  // Close previous tab if it exists
  // DISABLED per user request: open each one sequentially and keep them open
  /* 
  if (activeJobTabId) {
    chrome.tabs.remove(activeJobTabId, () => {
      if (chrome.runtime.lastError) { }
    });
    activeJobTabId = null;
  }
  */

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

async function callOllama(prompt) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: "llama2",
      prompt: prompt,
      stream: false
    })
  });

  const data = await res.json();
  return data.response;
}
