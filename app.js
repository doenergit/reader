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
let cbzDisplayMode = localStorage.getItem('cbzDisplayMode') || 'single';
let cbzReadDirection = localStorage.getItem('cbzReadDirection') || 'rtl';


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

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cbzSettings = document.getElementById('cbz-settings');
const btnLayoutSingle = document.getElementById('btn-layout-single');
const btnLayoutDouble = document.getElementById('btn-layout-double');
const btnDirRtl = document.getElementById('btn-dir-rtl');
const btnDirLtr = document.getElementById('btn-dir-ltr');

function updateSettingsUI() {
  btnLayoutSingle.classList.toggle('active', cbzDisplayMode === 'single');
  btnLayoutDouble.classList.toggle('active', cbzDisplayMode === 'double');
  btnDirRtl.classList.toggle('active', cbzReadDirection === 'rtl');
  btnDirLtr.classList.toggle('active', cbzReadDirection === 'ltr');
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsModal.style.display = 'flex';
  cbzSettings.style.display = currentBook && currentBook.type === 'cbz' ? 'block' : 'none';
  updateSettingsUI();
});
closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});
btnLayoutSingle.addEventListener('click', () => { cbzDisplayMode = 'single'; localStorage.setItem('cbzDisplayMode', cbzDisplayMode); updateSettingsUI(); if(currentBook?.type==='cbz') renderCbzPage(currentCbzIndex); });
btnLayoutDouble.addEventListener('click', () => { cbzDisplayMode = 'double'; localStorage.setItem('cbzDisplayMode', cbzDisplayMode); updateSettingsUI(); if(currentBook?.type==='cbz') renderCbzPage(currentCbzIndex); });
btnDirRtl.addEventListener('click', () => { cbzReadDirection = 'rtl'; localStorage.setItem('cbzReadDirection', cbzReadDirection); updateSettingsUI(); if(currentBook?.type==='cbz') renderCbzPage(currentCbzIndex); });
btnDirLtr.addEventListener('click', () => { cbzReadDirection = 'ltr'; localStorage.setItem('cbzReadDirection', cbzReadDirection); updateSettingsUI(); if(currentBook?.type==='cbz') renderCbzPage(currentCbzIndex); });

const epubViewer = document.getElementById('epub-viewer');

const tapPrev = document.getElementById('tap-prev');
const tapMenu = document.getElementById('tap-menu');
const tapNext = document.getElementById('tap-next');

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
  // Sort by last read descending
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
  // Cleanup CBZ
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

  // Cleanup EPUB
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

// Overlay UI Toggle
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
// 5. CBZ Reader (Minimal RAM Streamer)
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

  // Natural sort (page 1, 2, ... 10)
  entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  currentCbzEntries = entries;

  pageSlider.min = 1;
  pageSlider.max = entries.length;
  currentCbzIndex = (book.progress && book.progress.page) ? book.progress.page : 0;
  if (currentCbzIndex >= entries.length) currentCbzIndex = 0;

  await renderCbzPage(currentCbzIndex);
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
    
    if (cbzReadDirection === 'rtl') {
      cbzViewer.style.flexDirection = 'row-reverse';
    } else {
      cbzViewer.style.flexDirection = 'row';
    }
    
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
}

function cbzNext() {
  const step = (cbzDisplayMode === 'double' && currentCbzIndex > 0) ? 2 : 1;
  if (currentCbzIndex + step < currentCbzEntries.length) {
    renderCbzPage(currentCbzIndex + step);
  }
}

function cbzPrev() {
  if (currentCbzIndex > 0) {
    const step = (cbzDisplayMode === 'double' && currentCbzIndex > 1) ? 2 : 1;
    renderCbzPage(currentCbzIndex - step);
  }
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

  // Dark Theme Styling
  currentEpubRendition.themes.default({
    'body': {
      'background': '#121212 !important',
      'color': '#e0e0e0 !important',
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
      'line-height': '1.6 !important',
      'padding': '16px !important'
    },
    'p, span, div, h1, h2, h3, h4, h5, h6': {
      'color': '#e0e0e0 !important'
    },
    'a': {
      'color': '#60a5fa !important'
    }
  });

  pageSlider.min = 1;
  pageSlider.max = 100;
  pageSlider.value = 1;

  const savedCfi = currentBook.progress ? currentBook.progress.cfi : undefined;
  await currentEpubRendition.display(savedCfi);

  // Hook touch/click inside the EPUB iframe
  currentEpubRendition.on('rendered', (section, view) => {
    if (view && view.document) {
      view.document.addEventListener('click', handlePageClick);
    }
  });

  // Generate locations for slider / percentage
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

    dbUpdateProgress(currentBook.id, {
      cfi: cfi,
      percentage: percentage
    });
  });
}

function epubNext() {
  if (currentEpubRendition) currentEpubRendition.next();
}

function epubPrev() {
  if (currentEpubRendition) currentEpubRendition.prev();
}

// ==========================================
// 7. Navigation & Tap Zones
// ==========================================
function handlePageClick(e) {
  const width = window.innerWidth;
  const x = e.clientX || (e.touches && e.touches[0].clientX);
  if (!x) return;

  const isRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  if (x < width * 0.3) {
    isRtl ? navigateNext() : navigatePrev();
  } else if (x > width * 0.7) {
    isRtl ? navigatePrev() : navigateNext();
  } else {
    toggleOverlay();
  }
}

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

tapPrev.addEventListener('click', () => {
  const isRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  isRtl ? navigateNext() : navigatePrev();
});
tapNext.addEventListener('click', () => {
  const isRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  isRtl ? navigatePrev() : navigateNext();
});
tapMenu.addEventListener('click', toggleOverlay);

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

// ==========================================
// 7.5 Swipe / Slide Detection
// ==========================================
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;
const readerCanvas = document.querySelector('.reader-canvas-container');

readerCanvas.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

readerCanvas.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  if (!currentBook) return;
  
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  
  // Ignore vertical swipes (might be scrolling if zoomed)
  if (Math.abs(diffY) > Math.abs(diffX)) return;
  
  // Swipe threshold (min distance)
  if (Math.abs(diffX) < 40) return;
  
  const isRtl = (currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  
  if (diffX < 0) {
    // Swipe Left (<-)
    isRtl ? navigatePrev() : navigateNext();
  } else {
    // Swipe Right (->)
    isRtl ? navigateNext() : navigatePrev();
  }
}

// 8. Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker Registrierung fehlgeschlagen:', err);
    });
  });
}


const forceReloadBtn = document.getElementById('force-reload-btn');
if (forceReloadBtn) {
  forceReloadBtn.addEventListener('click', () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
        }
        window.location.reload(true);
      });
    } else {
      window.location.reload(true);
    }
  });
}

// Initial Boot
refreshLibrary();
