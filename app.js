// ==========================================
// 1. IndexedDB Minimal Helper
// ==========================================
const DB_NAME = 'MinimalReaderDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbSaveBook(book) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(book);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAllBooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetBook(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbUpdateProgress(id, progress) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const book = getReq.result;
      if (book) {
        book.progress = progress;
        book.lastReadAt = Date.now();
        store.put(book);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function dbDeleteBook(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ==========================================
// 2. State & DOM References
// ==========================================
let currentBook = null;
let currentCbzZip = null;
let currentCbzEntries = [];
let currentCbzIndex = 0;
let currentObjectUrl = null;
let currentObjectUrl2 = null;

// Settings: default 'ltr' so right tap / left swipe = NEXT (Weiter)
let cbzDisplayMode = localStorage.getItem('cbzDisplayMode') || 'single';
let cbzReadDirection = localStorage.getItem('cbzReadDirection') || 'ltr';

let currentEpubBook = null;
let currentEpubRendition = null;

// UI Elements
const libraryView = document.getElementById('library-view');
const readerView = document.getElementById('reader-view');
const bookListEl = document.getElementById('book-list');
const emptyStateEl = document.getElementById('empty-state');
const fileInput = document.getElementById('file-input');
const addBookBtn = document.getElementById('add-book-btn');

const readerTitle = document.getElementById('reader-title');
const closeReaderBtn = document.getElementById('close-reader-btn');
const readerOverlay = document.getElementById('reader-overlay');
const pageSlider = document.getElementById('page-slider');
const pageInfo = document.getElementById('page-info');
const loadingIndicator = document.getElementById('loading');

const cbzViewer = document.getElementById('cbz-viewer');
const cbzPage1 = document.getElementById('cbz-page-1');
const cbzPage2 = document.getElementById('cbz-page-2');
const epubViewer = document.getElementById('epub-viewer');
const readerCanvas = document.querySelector('.reader-canvas-container');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cbzSettings = document.getElementById('cbz-settings');
const btnLayoutSingle = document.getElementById('btn-layout-single');
const btnLayoutDouble = document.getElementById('btn-layout-double');
const btnDirRtl = document.getElementById('btn-dir-rtl');
const btnDirLtr = document.getElementById('btn-dir-ltr');
const forceReloadBtn = document.getElementById('force-reload-btn');

function updateSettingsUI() {
  if (btnLayoutSingle) btnLayoutSingle.classList.toggle('active', cbzDisplayMode === 'single');
  if (btnLayoutDouble) btnLayoutDouble.classList.toggle('active', cbzDisplayMode === 'double');
  if (btnDirLtr) btnDirLtr.classList.toggle('active', cbzReadDirection === 'ltr');
  if (btnDirRtl) btnDirRtl.classList.toggle('active', cbzReadDirection === 'rtl');
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsModal.style.display = 'flex';
    if (cbzSettings) cbzSettings.style.display = currentBook && currentBook.type === 'cbz' ? 'block' : 'none';
    updateSettingsUI();
  });
}
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
}
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
  });
}

if (btnLayoutSingle) {
  btnLayoutSingle.addEventListener('click', () => {
    cbzDisplayMode = 'single';
    localStorage.setItem('cbzDisplayMode', 'single');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') renderCbzPage(currentCbzIndex);
  });
}
if (btnLayoutDouble) {
  btnLayoutDouble.addEventListener('click', () => {
    cbzDisplayMode = 'double';
    localStorage.setItem('cbzDisplayMode', 'double');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') renderCbzPage(currentCbzIndex);
  });
}
if (btnDirLtr) {
  btnDirLtr.addEventListener('click', () => {
    cbzReadDirection = 'ltr';
    localStorage.setItem('cbzReadDirection', 'ltr');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') renderCbzPage(currentCbzIndex);
  });
}
if (btnDirRtl) {
  btnDirRtl.addEventListener('click', () => {
    cbzReadDirection = 'rtl';
    localStorage.setItem('cbzReadDirection', 'rtl');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') renderCbzPage(currentCbzIndex);
  });
}

if (forceReloadBtn) {
  forceReloadBtn.addEventListener('click', async () => {
    forceReloadBtn.textContent = 'Aktualisiere...';
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (let r of regs) await r.unregister();
        const keys = await caches.keys();
        for (let k of keys) await caches.delete(k);
      } catch (e) {}
    }
    window.location.reload(true);
  });
}

// ==========================================
// 3. Library Management
// ==========================================
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function refreshLibrary() {
  const books = await dbGetAllBooks();
  books.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

  bookListEl.innerHTML = '';
  if (books.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  books.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-card';

    let progressText = 'Ungelesen';
    if (book.progress) {
      if (book.type === 'cbz' && book.progress.total) {
        progressText = `Seite ${book.progress.page + 1} / ${book.progress.total}`;
      } else if (book.type === 'epub' && book.progress.percentage !== undefined) {
        progressText = `${Math.round(book.progress.percentage)}% gelesen`;
      }
    }

    card.innerHTML = `
      <div class="book-info">
        <div class="book-title" title="${book.name}">${book.name}</div>
        <div class="book-meta">
          <span class="format-badge ${book.type}">${book.type}</span>
          <span>${formatBytes(book.size)}</span>
          <span>•</span>
          <span>${progressText}</span>
        </div>
      </div>
      <div class="book-actions">
        <button class="btn-delete" title="Buch löschen" data-id="${book.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    card.querySelector('.book-info').addEventListener('click', () => openBook(book.id));
    card.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`"${book.name}" wirklich von deinem Gerät löschen?`)) {
        await dbDeleteBook(book.id);
        refreshLibrary();
      }
    });

    bookListEl.appendChild(card);
  });
}

// Add Book File Handling
addBookBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  let type = '';
  if (ext === 'cbz' || ext === 'zip') type = 'cbz';
  else if (ext === 'epub') type = 'epub';
  else {
    alert('Bitte nur .cbz oder .epub Dateien auswählen.');
    fileInput.value = '';
    return;
  }

  const newBook = {
    id: Date.now().toString(),
    name: file.name,
    type: type,
    size: file.size,
    blob: file,
    addedAt: Date.now(),
    lastReadAt: Date.now(),
    progress: { page: 0, total: 0 }
  };

  await dbSaveBook(newBook);
  fileInput.value = '';
  await refreshLibrary();
  openBook(newBook.id);
});

// ==========================================
// 4. Reader Controller
// ==========================================
async function openBook(id) {
  currentBook = await dbGetBook(id);
  if (!currentBook) return;

  readerTitle.textContent = currentBook.name;
  libraryView.style.display = 'none';
  readerView.classList.add('active');
  showOverlay();
  updateSettingsUI();

  loadingIndicator.classList.add('active');

  if (currentBook.type === 'cbz') {
    cbzViewer.style.display = 'flex';
    epubViewer.style.display = 'none';
    await initCbzReader(currentBook);
  } else if (currentBook.type === 'epub') {
    cbzViewer.style.display = 'none';
    epubViewer.style.display = 'block';
    await initEpubReader(currentBook);
  }

  loadingIndicator.classList.remove('active');
}

function closeReader() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (currentObjectUrl2) {
    URL.revokeObjectURL(currentObjectUrl2);
    currentObjectUrl2 = null;
  }
  cbzPage1.src = '';
  cbzPage2.src = '';
  currentCbzZip = null;
  currentCbzEntries = [];

  if (currentEpubRendition) {
    currentEpubRendition.destroy();
    currentEpubRendition = null;
  }
  if (currentEpubBook) {
    currentEpubBook.destroy();
    currentEpubBook = null;
  }
  epubViewer.innerHTML = '';

  currentBook = null;
  readerView.classList.remove('active');
  libraryView.style.display = 'flex';
  refreshLibrary();
}

closeReaderBtn.addEventListener('click', closeReader);

function toggleOverlay() {
  readerOverlay.classList.toggle('visible');
}
function showOverlay() {
  readerOverlay.classList.add('visible');
}
function hideOverlay() {
  readerOverlay.classList.remove('visible');
}

// ==========================================
// 5. CBZ Reader (Memory Streamer & Preloader)
// ==========================================
async function initCbzReader(book) {
  const zip = await JSZip.loadAsync(book.blob);
  currentCbzZip = zip;

  const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'];
  const entries = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) return;
    const lower = relativePath.toLowerCase();
    if (validExts.some(ext => lower.endsWith(ext))) {
      entries.push(relativePath);
    }
  });

  entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  currentCbzEntries = entries;

  pageSlider.min = 1;
  pageSlider.max = entries.length;
  currentCbzIndex = (book.progress && book.progress.page) ? book.progress.page : 0;
  if (currentCbzIndex >= entries.length) currentCbzIndex = 0;

  await renderCbzPage(currentCbzIndex);
}

function preloadCbzPage(index) {
  if (!currentCbzZip || index < 0 || index >= currentCbzEntries.length) return;
  const entryName = currentCbzEntries[index];
  const file = currentCbzZip.file(entryName);
  if (file) file.async('blob').catch(() => {});
}

async function renderCbzPage(index) {
  if (index < 0 || index >= currentCbzEntries.length) return;

  if (cbzDisplayMode === 'double' && index > 0) {
    if (index % 2 === 0) index = index - 1;
  }

  currentCbzIndex = index;
  loadingIndicator.classList.add('active');

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  if (currentObjectUrl2) URL.revokeObjectURL(currentObjectUrl2);

  const entryName1 = currentCbzEntries[index];
  const blob1 = await currentCbzZip.file(entryName1).async('blob');
  currentObjectUrl = URL.createObjectURL(blob1);

  if (cbzDisplayMode === 'single' || index === 0 || index >= currentCbzEntries.length - 1) {
    cbzPage1.src = currentObjectUrl;
    cbzPage1.style.display = 'block';
    cbzPage1.style.maxWidth = '100%';
    cbzPage2.style.display = 'none';
    cbzViewer.style.flexDirection = 'row';

    pageSlider.value = index + 1;
    pageInfo.textContent = `${index + 1} / ${currentCbzEntries.length}`;
  } else {
    const entryName2 = currentCbzEntries[index + 1];
    const blob2 = await currentCbzZip.file(entryName2).async('blob');
    currentObjectUrl2 = URL.createObjectURL(blob2);

    cbzViewer.style.flexDirection = (cbzReadDirection === 'rtl') ? 'row-reverse' : 'row';

    cbzPage1.src = currentObjectUrl;
    cbzPage2.src = currentObjectUrl2;

    cbzPage1.style.display = 'block';
    cbzPage1.style.maxWidth = '50%';
    cbzPage2.style.display = 'block';
    cbzPage2.style.maxWidth = '50%';

    pageSlider.value = index + 2;
    pageInfo.textContent = `${index + 1}-${index + 2} / ${currentCbzEntries.length}`;
  }

  loadingIndicator.classList.remove('active');
  dbUpdateProgress(currentBook.id, { page: currentCbzIndex, total: currentCbzEntries.length });

  // Preload next pages for zero latency
  preloadCbzPage(index + 1);
  if (cbzDisplayMode === 'double') {
    preloadCbzPage(index + 2);
    preloadCbzPage(index + 3);
  }
}

function cbzNext() {
  if (currentCbzIndex >= currentCbzEntries.length - 1) return;
  const step = (cbzDisplayMode === 'double' && currentCbzIndex > 0) ? 2 : 1;
  const target = Math.min(currentCbzEntries.length - 1, currentCbzIndex + step);
  renderCbzPage(target);
}

function cbzPrev() {
  if (currentCbzIndex <= 0) return;
  const step = (cbzDisplayMode === 'double' && currentCbzIndex > 1) ? 2 : 1;
  const target = Math.max(0, currentCbzIndex - step);
  renderCbzPage(target);
}

pageSlider.addEventListener('input', (e) => {
  if (currentBook && currentBook.type === 'cbz') {
    const targetIndex = parseInt(e.target.value, 10) - 1;
    renderCbzPage(targetIndex);
  } else if (currentBook && currentBook.type === 'epub' && currentEpubBook) {
    const percentage = (parseInt(e.target.value, 10) - 1) / 100;
    const cfi = currentEpubBook.locations.cfiFromPercentage(percentage);
    if (cfi) currentEpubRendition.display(cfi);
  }
});

// ==========================================
// 6. EPUB Reader
// ==========================================
async function initEpubReader(book) {
  const arrayBuffer = await book.blob.arrayBuffer();
  currentEpubBook = ePub(arrayBuffer);

  currentEpubRendition = currentEpubBook.renderTo('epub-viewer', {
    width: '100%',
    height: '100%',
    spread: 'none',
    flow: 'paginated'
  });

  currentEpubRendition.themes.default({
    'body': {
      'background': '#121212 !important',
      'color': '#e0e0e0 !important',
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
      'line-height': '1.6 !important',
      'padding': '16px !important'
    },
    'p, span, div, h1, h2, h3, h4, h5, h6': { 'color': '#e0e0e0 !important' },
    'a': { 'color': '#60a5fa !important' }
  });

  pageSlider.min = 1;
  pageSlider.max = 100;
  pageSlider.value = 1;

  const savedCfi = currentBook.progress ? currentBook.progress.cfi : undefined;
  await currentEpubRendition.display(savedCfi);

  currentEpubBook.ready.then(() => {
    return currentEpubBook.locations.generate(1024);
  }).then(() => {
    if (currentBook.progress && currentBook.progress.cfi) {
      const pct = currentEpubBook.locations.percentageFromCfi(currentBook.progress.cfi);
      if (pct !== undefined) {
        pageSlider.value = Math.max(1, Math.round(pct * 100));
        pageInfo.textContent = `${Math.round(pct * 100)}%`;
      }
    }
  });

  currentEpubRendition.on('relocated', (location) => {
    if (!location || !location.start) return;
    const cfi = location.start.cfi;
    let percentage = 0;
    if (currentEpubBook.locations && currentEpubBook.locations.length()) {
      percentage = currentEpubBook.locations.percentageFromCfi(cfi) * 100;
      pageSlider.value = Math.max(1, Math.round(percentage));
      pageInfo.textContent = `${Math.round(percentage)}%`;
    } else {
      pageInfo.textContent = location.start.displayed ? `${location.start.displayed.page}` : '';
    }

    dbUpdateProgress(currentBook.id, { cfi: cfi, percentage: percentage });
  });
}

function epubNext() {
  if (currentEpubRendition) currentEpubRendition.next();
}
function epubPrev() {
  if (currentEpubRendition) currentEpubRendition.prev();
}

// ==========================================
// 7. Navigation & Unified Gesture Engine (MangaPlus Style)
// ==========================================
function navigateNext() {
  hideOverlay();
  if (!currentBook) return;
  if (currentBook.type === 'cbz') cbzNext();
  else if (currentBook.type === 'epub') epubNext();
}

function navigatePrev() {
  hideOverlay();
  if (!currentBook) return;
  if (currentBook.type === 'cbz') cbzPrev();
  else if (currentBook.type === 'epub') epubPrev();
}

function handleReaderTap(clientX) {
  const width = window.innerWidth;
  const isMangaRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');

  // Left 35%
  if (clientX < width * 0.35) {
    isMangaRtl ? navigateNext() : navigatePrev();
  }
  // Right 35%
  else if (clientX > width * 0.65) {
    isMangaRtl ? navigatePrev() : navigateNext();
  }
  // Center 30%
  else {
    toggleOverlay();
  }
}

// Attach directly to readerView (covers entire fullscreen)
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouching = false;
let isSwiping = false;

readerView.addEventListener('touchstart', (e) => {
  // Ignore touches on navigation controls, sliders or settings
  if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .settings-modal')) return;
  if (e.touches.length !== 1) return;

  isTouching = true;
  isSwiping = false;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
}, { passive: true });

readerView.addEventListener('touchmove', (e) => {
  if (!isTouching || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;

  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    isSwiping = true;
  }

  // Smooth horizontal drag resistance like MangaPlus
  if (Math.abs(dx) > Math.abs(dy) && currentBook?.type === 'cbz') {
    e.preventDefault();
    cbzViewer.style.transform = `translateX(${dx * 0.3}px)`;
  }
}, { passive: false });

readerView.addEventListener('touchend', (e) => {
  if (!isTouching) return;
  isTouching = false;

  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Spring back viewer transform
  if (currentBook?.type === 'cbz') {
    cbzViewer.style.transition = 'transform 0.15s ease-out';
    cbzViewer.style.transform = 'translateX(0)';
    setTimeout(() => { cbzViewer.style.transition = 'none'; }, 150);
  }

  // 1. SWIPE DETECTION (> 35px horizontal movement)
  if (isSwiping && Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
    const isMangaRtl = (currentBook?.type === 'cbz' && cbzReadDirection === 'rtl');
    if (dx < 0) {
      // Swiped Left (finger moved right to left) -> NEXT in LTR
      isMangaRtl ? navigatePrev() : navigateNext();
    } else {
      // Swiped Right (finger moved left to right) -> PREV in LTR
      isMangaRtl ? navigateNext() : navigatePrev();
    }
    return;
  }

  // 2. TAP DETECTION
  if (!isSwiping || (Math.abs(dx) < 15 && Math.abs(dy) < 15)) {
    handleReaderTap(touch.clientX);
  }
});

// Desktop Click Fallback
readerView.addEventListener('click', (e) => {
  if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .settings-modal')) return;
  if ('ontouchstart' in window) return;
  handleReaderTap(e.clientX);
});

// Keyboard support
window.addEventListener('keydown', (e) => {
  if (!currentBook) return;
  if (e.key === 'ArrowRight' || e.key === ' ') {
    navigateNext();
  } else if (e.key === 'ArrowLeft') {
    navigatePrev();
  } else if (e.key === 'Escape') {
    closeReader();
  }
});

// ==========================================
// 8. Pull-To-Refresh (Classic Reload Banner)
// ==========================================
const ptrIndicator = document.getElementById('ptr-indicator');
const ptrText = document.getElementById('ptr-text');
const libraryContent = document.querySelector('.library-content');

let ptrStartY = 0;
let ptrCurrentY = 0;
let ptrPulling = false;
const PTR_THRESHOLD = 80;

window.addEventListener('touchstart', (e) => {
  if (readerView.classList.contains('active')) return;
  if (libraryContent && libraryContent.scrollTop <= 0) {
    ptrStartY = e.touches[0].clientY;
    ptrPulling = true;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!ptrPulling) return;
  ptrCurrentY = e.touches[0].clientY;
  const diffY = ptrCurrentY - ptrStartY;

  if (diffY > 0 && libraryContent && libraryContent.scrollTop <= 0) {
    const pullHeight = Math.min(diffY * 0.45, 65);
    if (ptrIndicator) {
      ptrIndicator.style.height = `${pullHeight}px`;
      if (diffY > PTR_THRESHOLD) {
        ptrIndicator.classList.add('active');
        ptrText.textContent = 'Loslassen zum Aktualisieren';
      } else {
        ptrIndicator.classList.remove('active');
        ptrText.textContent = 'Nach unten ziehen zum Aktualisieren';
      }
    }
  } else if (ptrIndicator) {
    ptrIndicator.style.height = '0px';
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  if (!ptrPulling) return;
  ptrPulling = false;
  const diffY = ptrCurrentY - ptrStartY;

  if (diffY > PTR_THRESHOLD && libraryContent && libraryContent.scrollTop <= 0) {
    if (ptrIndicator) {
      ptrIndicator.style.height = '48px';
      ptrIndicator.classList.add('active');
      ptrText.textContent = 'Wird aktualisiert...';
    }

    setTimeout(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (let r of regs) await r.unregister();
          const keys = await caches.keys();
          for (let k of keys) await caches.delete(k);
        } catch (e) {}
      }
      window.location.reload(true);
    }, 350);
  } else if (ptrIndicator) {
    ptrIndicator.style.height = '0px';
    ptrIndicator.classList.remove('active');
  }
  ptrStartY = 0;
  ptrCurrentY = 0;
});

// ==========================================
// 9. Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker Registrierung fehlgeschlagen:', err);
    });
  });
}

// Initial Boot
refreshLibrary();
