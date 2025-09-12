# Google Scholar Author Highlighter

Highlights first-author, second-author, co-first-author, and last-author papers on Google Scholar profile pages.

## Fix in this version

### Issue: 

On some rows Google Scholar truncates long author lists with an ellipsis ("..."). This caused:
- The extension to match against an incomplete author list (first ~5 authors).
- No match or incorrect role detection for the profile owner (e.g., Last author not detected).
- Multiple repeated detail fetches and later passes overwriting the correct result.

### Fixes implemented:
- Prefer full author text from the author node’s title/aria-label when available.
- If still truncated, fetch the paper’s detail page and extract the complete author list (localized field labels supported).
- Cache the expanded full author list on the row (dataset.fullAuthors) and mark as expanded once.
- Recompute roles (First/Second/Co-First/Last) using the full list, update dataset, and re-apply current filters.
- On subsequent passes, always use the cached full author list to avoid regressions and unnecessary refetches.

## Installation

- Download the repository and load it as an unpacked extension in your browser's extensions page (e.g., `chrome://extensions` for Chrome).
- Alternatively, download the CRX file from releases and install it directly.

## Credit
- Original extension from [Chrome Web Store](https://chromewebstore.google.com/detail/ijmngekkpaccbbjimedfkjpigplaikah?utm_source=item-share-cb)
