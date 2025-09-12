chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && isGoogleScholarURL(tab.url)) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['highlight.css']
      });
    }
  });

  function isGoogleScholarURL(url) {
    // Match any TLD after scholar.google.
    const pattern = /^https:\/\/scholar\.google\.[a-z.]{2,6}\//;
    return pattern.test(url);
  }
