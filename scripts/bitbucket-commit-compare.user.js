// ==UserScript==
// @name         Bitbucket Commit Compare Buttons
// @namespace    https://github.com/junglesub/chrome-userscripts
// @version      0.1.0
// @description  Add quick compare buttons next to Bitbucket Cloud commits.
// @match        https://bitbucket.org/*/*/commits*
// @match        https://bitbucket.org/*/*/commits/*
// @match        https://bitbucket.org/*/*/branches/compare/*
// @match        https://bitbucket.org/*/*/branches/compare*
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_BRANCH = 'main';
  const BUTTON_CLASS = 'bb-commit-compare-button';
  const BUTTON_GROUP_CLASS = 'bb-commit-compare-buttons';
  const SWAP_LINK_CLASS = 'bb-commit-compare-swap-link';
  const HANDLED_ATTR = 'data-bb-commit-compare-handled';
  const SELECTED_ATTR = 'data-bb-commit-compare-selected';
  const COMMIT_RE = /^[0-9a-f]{7,40}$/i;
  const COMPARE_SEPARATORS = ['...', '..', '\r', '\n'];
  const EMPTY_COMPARE_MESSAGES = ['No commits to display.', 'There are no changes.'];

  let selectedCommit = null;

  const style = document.createElement('style');
  style.textContent = `
    .${BUTTON_GROUP_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: none;
      left: calc(100% + 4px);
      margin-left: 0;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      vertical-align: middle;
      z-index: 2;
    }

    .${BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 1px solid #dfe1e6;
      border-radius: 3px;
      background: #fff;
      color: #42526e;
      cursor: pointer;
      font: 12px/1 Arial, sans-serif;
      padding: 0;
    }

    .${BUTTON_CLASS}:hover {
      background: #f4f5f7;
      border-color: #c1c7d0;
      color: #172b4d;
    }

    .${BUTTON_CLASS}[${SELECTED_ATTR}="true"] {
      background: #eae6ff;
      border-color: #6554c0;
      color: #403294;
    }

    .${SWAP_LINK_CLASS} {
      display: inline-block;
      margin-top: 8px;
      color: #0052cc;
      font: 14px/20px Arial, sans-serif;
      text-decoration: none;
    }

    .${SWAP_LINK_CLASS}:hover {
      color: #0065ff;
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);

  function getRepoBaseUrl() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    return `${location.origin}/${parts[0]}/${parts[1]}`;
  }

  function normalizeRef(ref) {
    return String(ref || '').trim().replace(/^refs\/heads\//, '');
  }

  function getBranchFromUrl() {
    const parts = location.pathname.split('/').filter(Boolean);
    const branchIndex = parts.indexOf('branch');

    if (branchIndex !== -1 && parts[branchIndex + 1]) {
      return decodeURIComponent(parts.slice(branchIndex + 1).join('/'));
    }

    const queryBranch =
      new URLSearchParams(location.search).get('branch') ||
      new URLSearchParams(location.search).get('at');

    return queryBranch ? decodeURIComponent(queryBranch) : '';
  }

  function getBranchFromPage() {
    const showAllLink = Array.from(document.querySelectorAll('a, button')).find((element) => {
      return element.textContent.trim().toLowerCase() === 'show all';
    });

    if (!showAllLink) {
      return '';
    }

    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    const branchButton = candidates
      .filter((element) => element.getBoundingClientRect().width > 0)
      .filter((element) => element.compareDocumentPosition(showAllLink) & Node.DOCUMENT_POSITION_FOLLOWING)
      .reverse()
      .find((element) => {
        const text = element.textContent.trim();
        return text && text.length <= 80 && !/search|show all/i.test(text);
      });

    return branchButton ? branchButton.textContent.trim() : '';
  }

  function getCompareBaseRef() {
    return normalizeRef(getBranchFromUrl() || getBranchFromPage() || DEFAULT_BRANCH);
  }

  function buildCompareUrl(sourceRef, targetRef) {
    const repoBaseUrl = getRepoBaseUrl();
    if (!repoBaseUrl) {
      return '';
    }

    const source = encodeURIComponent(normalizeRef(sourceRef));
    const target = encodeURIComponent(normalizeRef(targetRef));
    return `${repoBaseUrl}/branches/compare/${source}..${target}`;
  }

  function getCommitParentRef(commit) {
    return `${commit}^`;
  }

  function getCompareRefsFromUrl() {
    const parts = location.pathname.split('/').filter(Boolean);
    const compareIndex = parts.indexOf('compare');
    const encodedCompareRefs = compareIndex === -1 ? '' : parts[compareIndex + 1];
    const compareRefs = encodedCompareRefs ? decodeURIComponent(encodedCompareRefs) : '';
    const params = new URLSearchParams(location.search);

    if (!compareRefs) {
      const sourceRef = params.get('source') || params.get('from');
      const targetRef = params.get('target') || params.get('dest') || params.get('destination') || params.get('to');

      return sourceRef && targetRef ? { sourceRef, targetRef } : null;
    }

    const separator = COMPARE_SEPARATORS.find((candidate) => compareRefs.includes(candidate));
    if (!separator) {
      return null;
    }

    const [sourceRef, targetRef] = compareRefs.split(separator);
    if (!sourceRef || !targetRef) {
      return null;
    }

    return {
      sourceRef,
      targetRef,
    };
  }

  function openUrl(url) {
    if (!url) {
      return;
    }

    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, { active: true, insert: true });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function getCommitFromLink(link) {
    const url = new URL(link.href, location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    const commitsIndex = parts.indexOf('commits');
    const maybeCommit = commitsIndex === -1 ? '' : parts[commitsIndex + 1];

    return COMMIT_RE.test(maybeCommit) ? maybeCommit : '';
  }

  function markSelected(button, isSelected) {
    button.toggleAttribute(SELECTED_ATTR, isSelected);
    if (isSelected) {
      button.setAttribute(SELECTED_ATTR, 'true');
    }
  }

  function resetSelectedButtons() {
    document
      .querySelectorAll(`.${BUTTON_CLASS}[${SELECTED_ATTR}="true"]`)
      .forEach((button) => markSelected(button, false));
  }

  function iconSvg(path) {
    return `
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="${path}"></path>
      </svg>
    `;
  }

  function createButton(icon, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.innerHTML = icon;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });
    return button;
  }

  function addButtons(link, commit) {
    if (link.hasAttribute(HANDLED_ATTR)) {
      return;
    }

    link.setAttribute(HANDLED_ATTR, 'true');

    const group = document.createElement('span');
    group.className = BUTTON_GROUP_CLASS;

    const branchCompareButton = createButton(
      iconSvg('M5 2a3 3 0 1 0 1 2.83V6h4.5A2.5 2.5 0 0 1 13 8.5v.67a3 3 0 1 0 1 0V8.5A3.5 3.5 0 0 0 10.5 5H7V4.83A3 3 0 0 0 5 2Zm0 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm8 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z'),
      'Compare this commit with the selected branch',
      () => {
        openUrl(buildCompareUrl(getCompareBaseRef(), getCommitParentRef(commit)));
      }
    );

    const commitCompareButton = createButton(
      iconSvg('M2 4.5A2.5 2.5 0 0 1 4.5 2H6v1H4.5a1.5 1.5 0 0 0 0 3H6v1H4.5A2.5 2.5 0 0 1 2 4.5ZM6 5h4v1H6V5Zm4-3h1.5a2.5 2.5 0 0 1 0 5H10V6h1.5a1.5 1.5 0 0 0 0-3H10V2ZM2 11.5A2.5 2.5 0 0 1 4.5 9H6v1H4.5a1.5 1.5 0 0 0 0 3H6v1H4.5A2.5 2.5 0 0 1 2 11.5ZM6 12h4v1H6v-1Zm4-3h1.5a2.5 2.5 0 0 1 0 5H10v-1h1.5a1.5 1.5 0 0 0 0-3H10V9Z'),
      'Select another commit to compare with this commit',
      (button) => {
        if (!selectedCommit) {
          selectedCommit = commit;
          resetSelectedButtons();
          markSelected(button, true);
          return;
        }

        if (selectedCommit === commit) {
          selectedCommit = null;
          resetSelectedButtons();
          return;
        }

        openUrl(buildCompareUrl(commit, selectedCommit));
        selectedCommit = null;
        resetSelectedButtons();
      }
    );

    group.append(branchCompareButton, commitCompareButton);

    const host = link.parentElement;
    if (host) {
      host.style.position = 'relative';
      host.appendChild(group);
      return;
    }

    link.insertAdjacentElement('afterend', group);
  }

  function findEmptyCompareMessageElement() {
    const elements = Array.from(document.querySelectorAll('h1, h2, h3, p, span, strong, div'));

    return elements.find((element) => {
      const text = element.textContent.trim();
      const hasMessage = EMPTY_COMPARE_MESSAGES.some((message) => text.includes(message));
      if (!hasMessage || element.getBoundingClientRect().width === 0) {
        return false;
      }

      return !Array.from(element.children).some((child) => {
        const childText = child.textContent.trim();
        return EMPTY_COMPARE_MESSAGES.some((message) => childText.includes(message));
      });
    });
  }

  function addSwapCompareLink() {
    const refs = getCompareRefsFromUrl();
    if (!refs) {
      return;
    }

    const messageElement = findEmptyCompareMessageElement();
    if (!messageElement) {
      return;
    }

    const swapUrl = buildCompareUrl(refs.targetRef, refs.sourceRef);
    if (!swapUrl) {
      return;
    }

    const existingLink = document.querySelector(`.${SWAP_LINK_CLASS}`);
    const link = existingLink || document.createElement('a');
    link.className = SWAP_LINK_CLASS;
    link.href = swapUrl;
    link.target = '_top';
    link.textContent = 'Swap compare direction';
    link.onclick = (event) => {
      event.preventDefault();

      try {
        window.top.location.assign(swapUrl);
      } catch (_error) {
        location.assign(swapUrl);
      }
    };

    if (!existingLink) {
      messageElement.insertAdjacentElement('afterend', link);
    }
  }

  function scan() {
    document.querySelectorAll('a[href*="/commits/"]').forEach((link) => {
      const commit = getCommitFromLink(link);
      if (commit) {
        addButtons(link, commit);
      }
    });

    addSwapCompareLink();
  }

  let scanTimer = 0;
  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 100);
  }

  scan();
  window.addEventListener('hashchange', scheduleScan);
  window.addEventListener('popstate', scheduleScan);
  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
