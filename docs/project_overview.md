# Google Scholar Author Highlighter: Project Overview

This document provides an overview of the Google Scholar Author Highlighter Chrome extension, its purpose, and the function of each file in the project.

## Project Purpose

The extension is designed to automatically highlight publications on a Google Scholar profile page where the profile's owner is the first author, second author, a co-first author, or the last author. It achieves this by dynamically reading the author's name from the profile page and then analyzing the author list of each publication listed.

## File Breakdown

- **`manifest.json`**: The core configuration file for the Chrome extension. It defines permissions, background scripts, content scripts, and the popup UI.

- **`background.js`**: The service worker for the extension. Currently, it seems to have minimal or no active logic but could be used for handling events or future background tasks.

- **`content.js`**: This is the main workhorse of the extension. It gets injected into Google Scholar citation pages and performs the following tasks:
  1.  Extracts the profile owner's name from the page.
  2.  Iterates through each paper on the page.
  3.  Analyzes the author string for each paper to determine if the profile owner is a first, second, co-first, or last author. It uses a Levenshtein distance-based algorithm for robust name matching.
  4.  Applies CSS classes to highlight the relevant papers.
  5.  Injects a UI control panel directly onto the page to filter results and show statistics.

- **`showMoreClicker.js`**: This content script is responsible for handling the "Show More" button on the profile page. It ensures that newly loaded publications are also processed and highlighted by the main `content.js` logic.

- **`popup.html`**: Defines the structure for the extension's popup window that appears when the user clicks the extension icon in the Chrome toolbar.

- **`popup.js`**: The script for the popup window. Currently, its only function is to open a new tab to the extension's page on the Chrome Web Store.

- **`highlight.css`**: Contains the CSS rules for styling the highlighted papers on the Google Scholar page (e.g., different background colors for first author, last author, etc.).

- **`popup.css`**: Contains the CSS rules for styling the `popup.html` window.

- **`images/`**: A directory containing the extension's icons, such as `icon128.png`. 