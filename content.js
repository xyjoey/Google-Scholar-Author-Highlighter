// Google Scholar Author Highlighter - Content Script
(function() {
  // Guard to prevent script from running multiple times
  if (window.googleScholarAuthorHighlighterLoaded) {
    return;
  }
  window.googleScholarAuthorHighlighterLoaded = true;

  console.log('🚀 Google Scholar Author Highlighter - content.js loaded!');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);

  const REQUEST_SPACING_MS = 100;
  const REQUEST_BATCH_LIMIT = 10;
  const REQUEST_BATCH_COOLDOWN_MS = 1000;
  const AUTHOR_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  const AUTHOR_CACHE_PREFIX = 'authorHighlighterAuthors:';

  const throttledFetchQueue = [];
  let isProcessingThrottledQueue = false;
  let requestsProcessedInBatch = 0;

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function scheduleThrottledFetch(taskFn) {
    return new Promise((resolve, reject) => {
      throttledFetchQueue.push({ taskFn, resolve, reject });
      processThrottledFetchQueue();
    });
  }

  async function processThrottledFetchQueue() {
    if (isProcessingThrottledQueue) {
      return;
    }
    isProcessingThrottledQueue = true;
    while (throttledFetchQueue.length > 0) {
      if (requestsProcessedInBatch >= REQUEST_BATCH_LIMIT) {
        console.log(
          `[AuthorHighlighter][throttle] Processed ${REQUEST_BATCH_LIMIT} requests. Pausing for ${REQUEST_BATCH_COOLDOWN_MS}ms before continuing.`
        );
        await delay(REQUEST_BATCH_COOLDOWN_MS);
        requestsProcessedInBatch = 0;
      }

      const { taskFn, resolve, reject } = throttledFetchQueue.shift();
      try {
        const result = await taskFn();
        requestsProcessedInBatch++;
        resolve(result);
      } catch (err) {
        requestsProcessedInBatch++;
        reject(err);
      }

      if (throttledFetchQueue.length > 0) {
        console.log(`[AuthorHighlighter][throttle] Waiting ${REQUEST_SPACING_MS}ms before the next request.`);
        await delay(REQUEST_SPACING_MS);
      }
    }
    isProcessingThrottledQueue = false;
  }

  function getCacheKey(paperId) {
    return `${AUTHOR_CACHE_PREFIX}${paperId}`;
  }

  function extractPaperIdFromHref(href) {
    if (!href) {
      return null;
    }
    try {
      const parsed = new URL(href, window.location.origin);
      return (
        parsed.searchParams.get('citation_for_view') ||
        parsed.searchParams.get('cites') ||
        parsed.pathname + parsed.search
      );
    } catch (e) {
      console.warn('[AuthorHighlighter] Failed to derive paper id from href:', href, e);
      return href;
    }
  }

  function getCachedAuthors(paperId) {
    if (!paperId) {
      return null;
    }
    try {
      const storage = window.localStorage;
      if (!storage) {
        return null;
      }
      const raw = storage.getItem(getCacheKey(paperId));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed.timestamp || typeof parsed.authorsText !== 'string') {
        storage.removeItem(getCacheKey(paperId));
        return null;
      }
      const age = Date.now() - parsed.timestamp;
      if (age > AUTHOR_CACHE_DURATION_MS) {
        storage.removeItem(getCacheKey(paperId));
        console.log(`[AuthorHighlighter][cache-expired] Paper ${paperId} exceeded 30 minute cache window.`);
        return null;
      }
      console.log(
        `[AuthorHighlighter][cache-hit] Paper ${paperId} served from cache (${Math.round(age / 1000)}s old).`
      );
      return parsed.authorsText;
    } catch (e) {
      console.warn(`[AuthorHighlighter][cache-error] Failed reading cache for ${paperId}:`, e);
      return null;
    }
  }

  function setCachedAuthors(paperId, authorsText) {
    if (!paperId || !authorsText) {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage) {
        return;
      }
      storage.setItem(
        getCacheKey(paperId),
        JSON.stringify({ authorsText, timestamp: Date.now() })
      );
      console.log(`[AuthorHighlighter][cache-store] Paper ${paperId} cached for 30 minutes.`);
    } catch (e) {
      console.warn(`[AuthorHighlighter][cache-error] Failed writing cache for ${paperId}:`, e);
    }
  }

  function highlightAuthors() {
    const fullNameElement = document.querySelector('#gsc_prf_in');
    if (!fullNameElement) {
      console.error('Could not find author name element');
      return;
    }
    const profileNameOriginal = fullNameElement.textContent;

    // Consistent Cleaning for Profile Name:
    // 1. Lowercase
    // 2. Convert hyphens & dots to spaces
    // 3. Remove special symbols *†‡§
    const tempProfileNameForProcessing = profileNameOriginal.toLowerCase()
        .replace(/[\-\.]/g, ' ')
        .replace(/[*†‡§]/g, '');
    
    // For fullyCleanedProfileName (char subset, Levenshtein)
    const fullyCleanedProfileName = tempProfileNameForProcessing.replace(/\s+/g, '');

    function levenshteinDistance(s1, s2) {
      if (s1.length < s2.length) {
        return levenshteinDistance(s2, s1);
      }
      if (s2.length === 0) {
        return s1.length;
      }
      const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
      for (let i = 0; i < s1.length; i++) {
        const currentRow = [i + 1];
        for (let j = 0; j < s2.length; j++) {
          const insertions = previousRow[j + 1] + 1;
          const deletions = currentRow[j] + 1;
          const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
          currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow.splice(0, previousRow.length, ...currentRow);
      }
      return previousRow[s2.length];
    }

    // 返回匹配到的共一符号（* † ‡ § 之一），若无则返回空字符串
    function isCoFirstAuthor(author) {
      const coFirstSymbols = "*†‡§";
      for (const symbol of coFirstSymbols) {
        if (author.includes(symbol)) {
          return symbol;
        }
      }
      return '';
    }

    function isCharSubset(candidateCleanedName, localProfileCleanedName) {
        if (!candidateCleanedName) return true;
        if (!localProfileCleanedName && candidateCleanedName) return false;
        if (!localProfileCleanedName && !candidateCleanedName) return true;

        const profileCharCounts = {};
        for (const char of localProfileCleanedName) {
            profileCharCounts[char] = (profileCharCounts[char] || 0) + 1;
        }
        for (const char of candidateCleanedName) {
            if (!profileCharCounts[char] || profileCharCounts[char] === 0) {
                return false;
            }
            profileCharCounts[char]--;
        }
        return true;
    }

    // Rewritten getMatchScore function
    function getMatchScore(authorStringFromList, localFullyCleanedProfileName) {
        // Consistent cleaning for the author string from the list
        const tempAuthorNameToClean = authorStringFromList.toLowerCase()
            .replace(/[\-\.]/g, ' ') 
            .replace(/[*†‡§]/g, ''); // Remove symbols
        const candidateCleanedName = tempAuthorNameToClean.replace(/\s+/g, ''); // Final clean form for comparison

        // If the cleaned author name is empty, it cannot be a meaningful match.
        if (candidateCleanedName === '') {
            return Infinity; 
        }

        // Condition 1: All characters in the candidate name must come from the person's full name
        if (!isCharSubset(candidateCleanedName, localFullyCleanedProfileName)) {
            return Infinity; // Fails subset check, not a match
        }
        
        // Condition 2: The Levenshtein distance between the candidate name and the full name
        // The "minimum" aspect is handled by the caller which iterates through authors and picks the min score.
        return levenshteinDistance(candidateCleanedName, localFullyCleanedProfileName);
    }

    // Helper: try to get full authors text from attributes or by fetching details page when truncated
    function getCurrentFilters() {
      const first = document.getElementById('first-author-filter');
      const second = document.getElementById('second-author-filter');
      const coFirst = document.getElementById('co-first-author-filter');
      const last = document.getElementById('last-author-filter');
      return {
        first: first ? first.checked : true,
        second: second ? second.checked : true,
        coFirst: coFirst ? coFirst.checked : true,
        last: last ? last.checked : true
      };
    }

    function getAuthorsFromAttributes(authorsTextNode) {
      if (!authorsTextNode) return '';
      return (
        authorsTextNode.getAttribute && (authorsTextNode.getAttribute('title') || authorsTextNode.getAttribute('aria-label'))
      ) || authorsTextNode.textContent || '';
    }

    function getEffectiveAuthorsText(paper, authorsTextNode) {
      // If we've already expanded, prefer the cached full authors list
      if (paper && paper.dataset && paper.dataset.fullAuthors) {
        return paper.dataset.fullAuthors;
      }
      return getAuthorsFromAttributes(authorsTextNode);
    }

    async function fetchFullAuthorsFromDetails(paper) {
      try {
        const titleAnchor = paper.querySelector('.gsc_a_at');
        if (!titleAnchor) return null;
        const href = titleAnchor.getAttribute('href') || titleAnchor.getAttribute('data-href');
        if (!href) return null;
        const url = new URL(href, window.location.origin).toString();
        const paperId = extractPaperIdFromHref(href);

        const cachedAuthors = getCachedAuthors(paperId);
        if (cachedAuthors) {
          return cachedAuthors;
        }

        return await scheduleThrottledFetch(async () => {
          console.log(`[AuthorHighlighter][network-request] Fetching full authors for ${paperId || url}`);
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) {
            console.warn(
              `[AuthorHighlighter][network-request] Request failed for ${paperId || url} with status ${res.status}`
            );
            return null;
          }
          const html = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          let authorsText = null;
          const sections = doc.querySelectorAll('.gs_scl');
          sections.forEach(sec => {
            const field = sec.querySelector('.gsc_oci_field');
            const value = sec.querySelector('.gsc_oci_value');
            if (field && value) {
              const label = field.textContent ? field.textContent.trim().toLowerCase() : '';
              if (/author|作者|autores|autor|auteurs|autori|autoren|автор|авторы|著者/.test(label)) {
                authorsText = value.textContent ? value.textContent.trim() : '';
              }
            }
          });
          // Fallback: pick the first value that looks like a comma-separated author list
          if (!authorsText) {
            const guesses = Array.from(doc.querySelectorAll('.gsc_oci_value'))
              .map(el => (el.textContent || '').trim())
              .filter(t => t.split(',').length >= 2 && /[A-Za-z\u4e00-\u9fa5]/.test(t));
            if (guesses.length > 0) authorsText = guesses[0];
          }
          if (authorsText) {
            setCachedAuthors(paperId, authorsText);
          }
          return authorsText;
        });
      } catch (e) {
        console.warn('Failed to fetch full authors from details:', e);
        return null;
      }
    }

    async function expandAuthorsAndRecompute(paper, authorsTextNode) {
      if (paper.dataset.authorsExpanded === 'true') return; // avoid duplicate work
      paper.dataset.authorsExpanded = 'true';
      const fromAttr = getAuthorsFromAttributes(authorsTextNode);
      const textToUse = fromAttr && !fromAttr.includes('...') ? fromAttr : await fetchFullAuthorsFromDetails(paper);
      if (!textToUse) return;

      const fullAuthorList = textToUse
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0 && a !== '...');

  // Cache the expanded authors to be used by subsequent passes
  paper.dataset.fullAuthors = fullAuthorList.join(', ');

      let isFirstAuthor = false;
      let isLastAuthor = false;
      let hasCoFirstAuthorship = false;
      let isSecondAuthor = false;
      let bestMatchIndex = -1;
      let minScore = Infinity;
      let actualMatchedAuthorString = '';

      fullAuthorList.forEach((currentAuthorName, index) => {
        const score = getMatchScore(currentAuthorName, fullyCleanedProfileName);
        if (score < minScore) {
          minScore = score;
          bestMatchIndex = index;
          actualMatchedAuthorString = currentAuthorName;
        }
      });

      if (minScore !== Infinity) {
        const coFirstSymbolFound = isCoFirstAuthor(actualMatchedAuthorString);
        let qualifiesCoFirst = false;
        if (coFirstSymbolFound && fullAuthorList.length > 1) {
          let allPrecedingHaveSameSymbol = true;
          for (let j = 0; j < bestMatchIndex; j++) {
            if (!fullAuthorList[j].includes(coFirstSymbolFound)) {
              allPrecedingHaveSameSymbol = false;
              break;
            }
          }
          qualifiesCoFirst = allPrecedingHaveSameSymbol;
        }
        if (qualifiesCoFirst) {
          hasCoFirstAuthorship = true;
        } else {
          if (bestMatchIndex === 0) isFirstAuthor = true;
          if (bestMatchIndex === 1) isSecondAuthor = true;
          if (bestMatchIndex === fullAuthorList.length - 1) isLastAuthor = true;
        }
      }

      // Update dataset and log expanded result
      paper.dataset.isFirstAuthor = isFirstAuthor;
      paper.dataset.isSecondAuthor = isSecondAuthor;
      paper.dataset.isCoFirstAuthor = hasCoFirstAuthorship;
      paper.dataset.isLastAuthor = isLastAuthor;

      try {
        const titleNode = paper.querySelector('.gsc_a_at');
        const titleText = titleNode ? titleNode.textContent.trim() : '(No title found)';
        console.log(
          `[AuthorHighlighter][expanded] Title: "${titleText}" | Authors: ${fullAuthorList.join(', ')} | ` +
          `Matched: "${actualMatchedAuthorString}"@${bestMatchIndex} | First: ${isFirstAuthor} | Second: ${isSecondAuthor} | Co-First: ${hasCoFirstAuthorship} | Last: ${isLastAuthor}`
        );
      } catch (e) {
        console.warn('AuthorHighlighter expanded debug log error:', e);
      }

      // Re-apply current filters so highlighting reflects updated roles
  // Using a microtask to avoid synchronous re-entrancy issues
  Promise.resolve().then(() => applyFilters(getCurrentFilters()));
    }

  const papers = document.querySelectorAll('.gsc_a_tr');

    papers.forEach((paper) => {
  const authorsTextNode = paper.querySelector('.gs_gray');
  const alreadyExpanded = paper.dataset.authorsExpanded === 'true';
  const authorsText = getEffectiveAuthorsText(paper, authorsTextNode);
      // Ensure "..." is filtered out from the author list
      const authorList = authorsText.split(',').map(author => author.trim()).filter(author => author.length > 0 && author !== '...');

      let isFirstAuthor = false;
      let isLastAuthor = false;
      let hasCoFirstAuthorship = false;
      let isSecondAuthor = false;
  // Track best match for debug logging
  let bestMatchIndex = -1;
  let minScore = Infinity;
  let actualMatchedAuthorString = '';
  const originalAuthorsTextIncludesEllipsis = authorsText.includes('...');

  if (authorList.length > 0) {
        authorList.forEach((currentAuthorName, index) => {
          const score = getMatchScore(currentAuthorName, fullyCleanedProfileName);
          if (score < minScore) {
            minScore = score;
            bestMatchIndex = index;
            actualMatchedAuthorString = currentAuthorName;
          }
        });

        // If minScore is not Infinity, it means at least one author passed the subset check,
        // and minScore holds the minimum Levenshtein distance among them.
        if (minScore !== Infinity) { 
          const coFirstSymbolFound = isCoFirstAuthor(actualMatchedAuthorString);

          // 新规则：若作者名字含有共一符号，且论文作者数>1，则仅当该作者之前的所有作者都含有相同符号时才视为共一作者
          let qualifiesCoFirst = false;
          if (coFirstSymbolFound && authorList.length > 1) {
            let allPrecedingHaveSameSymbol = true;
            for (let j = 0; j < bestMatchIndex; j++) {
              if (!authorList[j].includes(coFirstSymbolFound)) {
                allPrecedingHaveSameSymbol = false;
                break;
              }
            }
            qualifiesCoFirst = allPrecedingHaveSameSymbol;
          }

          if (qualifiesCoFirst) {
            hasCoFirstAuthorship = true;
          } else {
            // 按正常的一作/二作/末作逻辑处理
            if (bestMatchIndex === 0) {
              isFirstAuthor = true;
            }
            if (bestMatchIndex === 1) {
              isSecondAuthor = true;
            }
            if (!originalAuthorsTextIncludesEllipsis && bestMatchIndex === authorList.length - 1) {
              isLastAuthor = true;
            }
          }
        }
      }

      // Debug logging: title, authors, matched author and role flags
      try {
        const titleNode = paper.querySelector('.gsc_a_at');
        const titleText = titleNode ? titleNode.textContent.trim() : '(No title found)';
  console.log(
          `[AuthorHighlighter] Title: "${titleText}" | Authors: ${authorList.join(', ')} | ` +
          `Matched: "${actualMatchedAuthorString}"@${bestMatchIndex} | First: ${isFirstAuthor} | Second: ${isSecondAuthor} | Co-First: ${hasCoFirstAuthorship} | Last: ${isLastAuthor}` +
          `${originalAuthorsTextIncludesEllipsis ? ' | Ellipsis in list' : ''}`
        );
      } catch (e) {
        console.warn('AuthorHighlighter debug log error:', e);
      }

      // Set data attributes
      paper.dataset.isFirstAuthor = isFirstAuthor;
      paper.dataset.isSecondAuthor = isSecondAuthor;
      paper.dataset.isCoFirstAuthor = hasCoFirstAuthorship;
      paper.dataset.isLastAuthor = isLastAuthor;

  // If not yet expanded and truncated or no match found, try to expand via details page
  if (!alreadyExpanded && (originalAuthorsTextIncludesEllipsis || bestMatchIndex === -1) && authorsTextNode) {
        // Fire and forget; recompute once full list is available
        expandAuthorsAndRecompute(paper, authorsTextNode);
      }
    });

    // Apply filters after setting data attributes
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get('filters', function(result) {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            // Use default filters
            const filters = { first: true, second: true, coFirst: true, last: true };
            applyFilters(filters);
          } else {
            const filters = result.filters || { first: true, second: true, coFirst: true, last: true };
            applyFilters(filters);
          }
        });
      } else {
        // Fallback if chrome.storage is not available
        const filters = { first: true, second: true, coFirst: true, last: true };
        applyFilters(filters);
      }
    } catch (e) {
      console.warn('Error accessing chrome.storage:', e);
      // Use default filters
      const filters = { first: true, second: true, coFirst: true, last: true };
      applyFilters(filters);
    }
  }

  function applyFilters(filters) {
    const papers = document.querySelectorAll('.gsc_a_tr');
    papers.forEach(paper => {
      // Remove all highlighting classes
      paper.classList.remove('highlighted-author', 'first-author', 'second-author', 'co-first-author', 'last-author');

      // Re-apply highlighting based on current filters
      if (filters.first && paper.dataset.isFirstAuthor === 'true') {
        paper.classList.add('first-author', 'highlighted-author');
      }
      if (filters.second && paper.dataset.isSecondAuthor === 'true') {
        paper.classList.add('second-author', 'highlighted-author');
      }
      if (filters.coFirst && paper.dataset.isCoFirstAuthor === 'true') {
        paper.classList.add('co-first-author', 'highlighted-author');
      }
      if (filters.last && paper.dataset.isLastAuthor === 'true') {
        paper.classList.add('last-author', 'highlighted-author');
      }
    });

    // After applying filters, update visibility based on current UI state
    const visibilityToggle = document.getElementById('visibility-toggle');
    if (visibilityToggle) {
      togglePaperVisibility(visibilityToggle.checked);
    } else {
      // Fallback: try to get from storage if UI element doesn't exist yet
      try {
        if (chrome && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get('showOnlyHighlighted', function(result) {
            if (chrome.runtime.lastError) {
              console.warn('Chrome storage error:', chrome.runtime.lastError);
              togglePaperVisibility(false);
            } else {
              togglePaperVisibility(result.showOnlyHighlighted || false);
            }
          });
        } else {
          togglePaperVisibility(false);
        }
      } catch (e) {
        console.warn('Error accessing chrome.storage:', e);
        togglePaperVisibility(false);
      }
    }

    displayHighlightedMetrics();
  }

  function togglePaperVisibility(showOnlyHighlighted) {
    const papers = document.querySelectorAll('.gsc_a_tr');
    papers.forEach(paper => {
      if (showOnlyHighlighted) {
        paper.style.display = paper.classList.contains('highlighted-author') ? '' : 'none';
      } else {
        paper.style.display = '';
      }
    });

    displayHighlightedMetrics();
  }

  function injectFilterUI() {
    if (document.getElementById('author-highlighter-controls')) {
      return; // Avoid injecting multiple times
    }

    const filterHTML = `
      <div id="author-highlighter-controls" class="author-highlighter-controls">
        <h3>Author Highlighter</h3>
        <div class="filter-container">
          <label>Highlight:</label>
          <div class="filter-options">
            <div>
              <input type="checkbox" id="first-author-filter" checked>
              <label for="first-author-filter">First</label>
            </div>
            <div>
              <input type="checkbox" id="second-author-filter" checked>
              <label for="second-author-filter">Second</label>
            </div>
            <div>
              <input type="checkbox" id="co-first-author-filter" checked>
              <label for="co-first-author-filter">Co-First</label>
            </div>
            <div>
              <input type="checkbox" id="last-author-filter" checked>
              <label for="last-author-filter">Last</label>
            </div>
          </div>
        </div>
        <div class="toggle-container">
          <label for="visibility-toggle">Show only highlighted:</label>
          <input type="checkbox" id="visibility-toggle">
        </div>
      </div>
    `;

    // Find the "Cited by" section
    const citedBySection = document.querySelector('#gsc_rsb_cit');

    if (citedBySection) {
      // Create a new container for the filter UI
      const controlsContainer = document.createElement('div');
      controlsContainer.innerHTML = filterHTML;

      // Insert the filter UI before the "Cited by" section
      citedBySection.parentNode.insertBefore(controlsContainer, citedBySection);
      setupEventListeners();
    } else {
      console.error('Could not find the "Cited by" section');
    }
  }

  function setupEventListeners() {
    const visibilityToggle = document.getElementById('visibility-toggle');
    const firstAuthorFilter = document.getElementById('first-author-filter');
    const secondAuthorFilter = document.getElementById('second-author-filter');
    const coFirstAuthorFilter = document.getElementById('co-first-author-filter');
    const lastAuthorFilter = document.getElementById('last-author-filter');

    visibilityToggle.addEventListener('change', function() {
      const showOnlyHighlighted = this.checked;
      try {
        if (chrome && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.set({ showOnlyHighlighted: showOnlyHighlighted }, function() {
            if (chrome.runtime.lastError) {
              console.warn('Chrome storage error:', chrome.runtime.lastError);
            }
          });
        }
      } catch (e) {
        console.warn('Error saving visibility toggle:', e);
      }
      togglePaperVisibility(showOnlyHighlighted);
    });

    [firstAuthorFilter, secondAuthorFilter, coFirstAuthorFilter, lastAuthorFilter].forEach(filter => {
      filter.addEventListener('change', updateFilters);
    });

    // Load initial state
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['showOnlyHighlighted', 'filters'], function(result) {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            // Use defaults
            visibilityToggle.checked = false;
            const filters = { first: true, second: true, coFirst: true, last: true };
            firstAuthorFilter.checked = filters.first;
            secondAuthorFilter.checked = filters.second;
            coFirstAuthorFilter.checked = filters.coFirst;
            lastAuthorFilter.checked = filters.last;
            applyFilters(filters);
          } else {
            visibilityToggle.checked = result.showOnlyHighlighted || false;
            const filters = result.filters || { first: true, second: true, coFirst: true, last: true };
            firstAuthorFilter.checked = filters.first;
            secondAuthorFilter.checked = filters.second;
            coFirstAuthorFilter.checked = filters.coFirst;
            lastAuthorFilter.checked = filters.last;
            applyFilters(filters);
          }
        });
      } else {
        // Use defaults when chrome.storage is not available
        visibilityToggle.checked = false;
        const filters = { first: true, second: true, coFirst: true, last: true };
        firstAuthorFilter.checked = filters.first;
        secondAuthorFilter.checked = filters.second;
        coFirstAuthorFilter.checked = filters.coFirst;
        lastAuthorFilter.checked = filters.last;
        applyFilters(filters);
      }
    } catch (e) {
      console.warn('Error loading initial state:', e);
      // Use defaults
      visibilityToggle.checked = false;
      const filters = { first: true, second: true, coFirst: true, last: true };
      firstAuthorFilter.checked = filters.first;
      secondAuthorFilter.checked = filters.second;
      coFirstAuthorFilter.checked = filters.coFirst;
      lastAuthorFilter.checked = filters.last;
      applyFilters(filters);
    }
  }

  function updateFilters() {
    const filters = {
      first: document.getElementById('first-author-filter').checked,
      second: document.getElementById('second-author-filter').checked,
      coFirst: document.getElementById('co-first-author-filter').checked,
      last: document.getElementById('last-author-filter').checked
    };
    
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ filters: filters }, function() {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
          }
          applyFilters(filters);
        });
      } else {
        applyFilters(filters);
      }
    } catch (e) {
      console.warn('Error saving filters:', e);
      applyFilters(filters);
    }
  }

  // Modify the existing observer
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const profileContainer = document.querySelector('#gsc_prf_w');
        if (profileContainer && !document.getElementById('author-highlighter-controls')) {
          injectFilterUI();
          highlightAuthors();
          observer.disconnect(); // Stop observing once we've injected the UI
          break;
        }
      }
    }
  });

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    initializeExtension();
  }

  function initializeExtension() {
    const profileContainer = document.querySelector('#gsc_prf_w');
    if (profileContainer) {
      injectFilterUI();
      highlightAuthors();
      observePaperChanges();
    } else {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function observePaperChanges() {
    const paperContainer = document.querySelector('#gsc_a_b');
    if (paperContainer) {
      const paperObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            highlightAuthors();
            break;
          }
        }
      });

      paperObserver.observe(paperContainer, { childList: true, subtree: true });
    } else {
      console.error('Could not find paper container');
    }
  }

  // Listen for messages from the popup
  try {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleVisibility') {
          togglePaperVisibility(request.showOnlyHighlighted);
        } else if (request.action === 'updateFilters') {
          applyFilters(request.filters);
          try {
            if (chrome && chrome.storage && chrome.storage.sync) {
              chrome.storage.sync.get('showOnlyHighlighted', function(result) {
                if (chrome.runtime.lastError) {
                  console.warn('Chrome storage error:', chrome.runtime.lastError);
                  togglePaperVisibility(false);
                } else {
                  togglePaperVisibility(result.showOnlyHighlighted || false);
                }
              });
            } else {
              togglePaperVisibility(false);
            }
          } catch (e) {
            console.warn('Error in message listener:', e);
            togglePaperVisibility(false);
          }
        }
      });
    }
  } catch (e) {
    console.warn('Error setting up message listener:', e);
  }

  function calculateHighlightedMetrics() {
    const highlightedPapers = document.querySelectorAll('.gsc_a_tr.highlighted-author');
    let totalCitations = 0;
    let citations = [];

    highlightedPapers.forEach(paper => {
      const citationElement = paper.querySelector('.gsc_a_ac');
      if (citationElement) {
        const citationCount = parseInt(citationElement.textContent, 10);
        if (!isNaN(citationCount)) {
          totalCitations += citationCount;
          citations.push(citationCount);
        }
      }
    });

    citations.sort((a, b) => b - a);
    const hIndex = citations.filter((c, i) => c > i).length;
    const h10Index = citations.filter(c => c >= 10).length;

    return {
      paperCount: highlightedPapers.length,
      totalCitations,
      hIndex,
      h10Index
    };
  }

  function displayHighlightedMetrics() {
    const metrics = calculateHighlightedMetrics();

    let metricsComponent = document.getElementById('highlighted-metrics');
    if (!metricsComponent) {
      metricsComponent = document.createElement('div');
      metricsComponent.id = 'highlighted-metrics';
      metricsComponent.className = 'highlighted-metrics';

      const controlsContainer = document.getElementById('author-highlighter-controls');
      if (controlsContainer) {
        controlsContainer.appendChild(metricsComponent);
      }
    }

    metricsComponent.innerHTML = `
      <hr class="metrics-divider">
      <h4>Highlighted Papers Metrics</h4>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Papers:</span>
          <span class="metric-value">${metrics.paperCount}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Citations:</span>
          <span class="metric-value">${metrics.totalCitations}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">h-index:</span>
          <span class="metric-value">${metrics.hIndex}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">h10-index:</span>
          <span class="metric-value">${metrics.h10Index}</span>
        </div>
      </div>
    `;
  }

  // Make highlightAuthors globally available for showMoreClicker.js
  window.highlightAuthors = highlightAuthors;
})();
