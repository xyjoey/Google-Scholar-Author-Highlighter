// Google Scholar Author Highlighter - Show More Clicker
const DEBUG_MODE = false; // Set to true to enable logging

if (DEBUG_MODE) console.log('🔄 Google Scholar Author Highlighter - showMoreClicker.js loaded!');
if (DEBUG_MODE) console.log('Current URL:', window.location.href);
if (DEBUG_MODE) console.log('Document readyState:', document.readyState);

// Simple test to ensure script runs
setTimeout(() => {
  if (DEBUG_MODE) console.log('⏰ showMoreClicker.js: 3 second timer completed');
}, 3000);

let retryCount = 0;
const MAX_RETRIES = 10;

function clickShowMoreUntilAllLoaded() {
  if (DEBUG_MODE) console.log('🔍 clickShowMoreUntilAllLoaded called');
  
  // Multiple possible selectors for the "Show more" button
  const possibleSelectors = [
    '#gsc_bpf_more',
    '.gsc_pgn_pnx',
    'button[onclick*="showMore"]',
    'button[onclick*="bpf_more"]',
    '.gs_btnPR[onclick*="showMore"]',
    '[data-i18n="show_more"]',
    'button:contains("Show more")',
    'button:contains("显示更多")',
    'button:contains("Mostrar más")',
    '.gsc_pgn button',
    '#gsc_pgn_pnx'
  ];
  
  let showMoreButton = null;
  let foundSelector = null;
  
  // Try to find the button using different selectors
  for (const selector of possibleSelectors) {
    try {
      if (selector.includes(':contains(')) {
        // Handle jQuery-style selectors manually
        const text = selector.match(/:contains\("(.+)"\)/)?.[1];
        if (text) {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
              showMoreButton = btn;
              foundSelector = `button containing "${text}"`;
              break;
            }
          }
        }
      } else {
        showMoreButton = document.querySelector(selector);
        if (showMoreButton) {
          foundSelector = selector;
          break;
        }
      }
    } catch (e) {
      if (DEBUG_MODE) console.warn(`Error with selector ${selector}:`, e);
    }
  }
  
  if (DEBUG_MODE) console.log(`Retry ${retryCount + 1}/${MAX_RETRIES}`);
  if (DEBUG_MODE) console.log('Looking for Show More button...');
  
  if (showMoreButton) {
    if (DEBUG_MODE) console.log(`✓ Found Show More button with selector: ${foundSelector}`);
    if (DEBUG_MODE) console.log('Button details:', {
      text: showMoreButton.textContent.trim(),
      disabled: showMoreButton.disabled,
      display: window.getComputedStyle(showMoreButton).display,
      visibility: window.getComputedStyle(showMoreButton).visibility,
      onclick: showMoreButton.onclick,
      className: showMoreButton.className
    });
    
    const isClickable = !showMoreButton.disabled && 
                       window.getComputedStyle(showMoreButton).display !== 'none' &&
                       window.getComputedStyle(showMoreButton).visibility !== 'hidden';
    
    if (isClickable) {
      if (DEBUG_MODE) console.log('✓ Button is clickable, clicking...');
      
      // Try multiple click methods
      try {
        showMoreButton.click();
      } catch (e) {
        if (DEBUG_MODE) console.warn('Standard click failed, trying alternatives:', e);
        try {
          showMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } catch (e2) {
          if (DEBUG_MODE) console.warn('Mouse event click failed:', e2);
          // Try triggering onclick directly if it exists
          if (showMoreButton.onclick) {
            showMoreButton.onclick.call(showMoreButton);
          }
        }
      }
      
      retryCount++;
      
      // Wait for content to load and check again
      setTimeout(() => {
        clickShowMoreUntilAllLoaded();
      }, 2000); // Increased wait time to 2 seconds
    } else {
      if (DEBUG_MODE) console.log('✗ Button found but not clickable (disabled, hidden, or invisible)');
      finishLoading();
    }
  } else {
    if (DEBUG_MODE) console.log('✗ No Show More button found with any selector');
    
    // Check if we have reached max retries or if papers are already loaded
    const paperCount = document.querySelectorAll('.gsc_a_tr').length;
    if (DEBUG_MODE) console.log(`Current paper count: ${paperCount}`);
    
    if (retryCount < MAX_RETRIES && paperCount < 20) {
      // Maybe the page is still loading, try again
      retryCount++;
      if (DEBUG_MODE) console.log(`Retrying in 1 second (attempt ${retryCount}/${MAX_RETRIES})...`);
      setTimeout(() => {
        clickShowMoreUntilAllLoaded();
      }, 1000);
    } else {
      if (DEBUG_MODE) console.log('✓ Finished: Either max retries reached or sufficient papers loaded');
      finishLoading();
    }
  }
}

function finishLoading() {
  if (DEBUG_MODE) console.log('🎉 All papers loaded or max attempts reached. Proceeding with highlighting...');
  retryCount = 0; // Reset for potential future use
  
  // All papers are loaded, now we can proceed with highlighting
  if (typeof highlightAuthors === 'function') {
    highlightAuthors();
  } else {
    if (DEBUG_MODE) console.error('highlightAuthors function not found');
  }
}

function waitForPageReady() {
  if (DEBUG_MODE) console.log('⏳ waitForPageReady called');
  // Wait for the paper container to exist
  const paperContainer = document.querySelector('#gsc_a_b, .gsc_a_tr');
  
  if (paperContainer) {
    if (DEBUG_MODE) console.log('✓ Paper container found, starting Show More clicking...');
    // Add a small delay to ensure the page is fully rendered
    setTimeout(() => {
      clickShowMoreUntilAllLoaded();
    }, 1000);
  } else {
    if (DEBUG_MODE) console.log('⏳ Paper container not found yet, retrying...');
    setTimeout(waitForPageReady, 500);
  }
}

// Start the process with multiple trigger points
if (DEBUG_MODE) console.log('🚀 Google Scholar Author Highlighter - Auto Show More starting...');

if (document.readyState === 'loading') {
  if (DEBUG_MODE) console.log('📄 Document is loading, adding DOMContentLoaded listener');
  document.addEventListener('DOMContentLoaded', waitForPageReady);
} else {
  if (DEBUG_MODE) console.log('📄 Document already ready, starting immediately');
  waitForPageReady();
}

// Also listen for page changes (for SPA navigation)
window.addEventListener('load', () => {
  if (DEBUG_MODE) console.log('🌐 Window load event fired');
  setTimeout(waitForPageReady, 1000);
});

// Additional observer for dynamic content - renamed to avoid conflicts
const showMoreObserver = new MutationObserver((mutations) => {
  let shouldCheck = false;
  
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if new content was added to the papers area
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && 
            (node.querySelector && node.querySelector('.gsc_a_tr, #gsc_bpf_more'))) {
          shouldCheck = true;
          break;
        }
      }
    }
  });
  
  if (shouldCheck) {
    if (DEBUG_MODE) console.log('📝 New content detected, checking for Show More button...');
    setTimeout(() => {
      clickShowMoreUntilAllLoaded();
    }, 500);
  }
});

// Start observing after a delay
setTimeout(() => {
  if (DEBUG_MODE) console.log('👀 Starting DOM mutation observer...');
  try {
    showMoreObserver.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
  } catch (e) {
    if (DEBUG_MODE) console.warn('Failed to start mutation observer:', e);
  }
}, 2000);