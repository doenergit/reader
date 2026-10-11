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

// Debounced Progress Saver
let progressTimeout = null;
function dbUpdateProgress(id, progress) {
  localStorage.setItem('prog_' + id, JSON.stringify({ progress, lastReadAt: Date.now() }));
  
  if (currentBook && currentBook.id === id) {
    currentBook.progress = progress;
    currentBook.lastReadAt = Date.now();
  }

  const bookInList = cachedBooksList.find(b => b.id === id);
  if (bookInList) {
    bookInList.progress = progress;
    bookInList.lastReadAt = Date.now();
  }

  clearTimeout(progressTimeout);
  progressTimeout = setTimeout(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const b = req.result;
        if (b) {
          b.progress = progress;
          b.lastReadAt = Date.now();
          store.put(b);
        }
      };
    } catch (e) {}
  }, 1000);
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

// Promise Cache
const cbzPromiseCache = new Map();

// In-Memory Books List
let cachedBooksList = [];

// Settings: single / double / vertical
let cbzDisplayMode = localStorage.getItem('cbzDisplayMode') || 'single';
let cbzFitMode = localStorage.getItem('cbzFitMode') || 'contain'; // 'contain' or 'width'
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

// CBZ Viewers
const cbzCarousel = document.getElementById('cbz-carousel');
const cbzTrack = document.getElementById('cbz-track');
const panel1Inner = document.getElementById('panel-1-inner');
const cbzVertical = document.getElementById('cbz-vertical');
const cbzVerticalContainer = document.getElementById('cbz-vertical-container');

const epubViewer = document.getElementById('epub-viewer');
const readerCanvas = document.querySelector('.reader-canvas-container');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cbzSettings = document.getElementById('cbz-settings');
const groupDirection = document.getElementById('group-direction');

const btnLayoutSingle = document.getElementById('btn-layout-single');
const btnLayoutDouble = document.getElementById('btn-layout-double');
const btnLayoutVertical = document.getElementById('btn-layout-vertical');

const btnFitContain = document.getElementById('btn-fit-contain');
const btnFitWidth = document.getElementById('btn-fit-width');

const btnDirRtl = document.getElementById('btn-dir-rtl');
const btnDirLtr = document.getElementById('btn-dir-ltr');
const forceReloadBtn = document.getElementById('force-reload-btn');

function updateSettingsUI() {
  if (btnLayoutSingle) btnLayoutSingle.classList.toggle('active', cbzDisplayMode === 'single');
  if (btnLayoutDouble) btnLayoutDouble.classList.toggle('active', cbzDisplayMode === 'double');
  if (btnLayoutVertical) btnLayoutVertical.classList.toggle('active', cbzDisplayMode === 'vertical');

  if (btnFitContain) btnFitContain.classList.toggle('active', cbzFitMode === 'contain');
  if (btnFitWidth) btnFitWidth.classList.toggle('active', cbzFitMode === 'width');

  if (btnDirLtr) btnDirLtr.classList.toggle('active', cbzReadDirection === 'ltr');
  if (btnDirRtl) btnDirRtl.classList.toggle('active', cbzReadDirection === 'rtl');

  if (groupDirection) {
    groupDirection.style.display = (cbzDisplayMode === 'vertical') ? 'none' : 'block';
  }
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

// Layout Buttons
if (btnLayoutSingle) {
  btnLayoutSingle.addEventListener('click', () => {
    cbzDisplayMode = 'single';
    localStorage.setItem('cbzDisplayMode', 'single');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') switchCbzLayout();
  });
}
if (btnLayoutDouble) {
  btnLayoutDouble.addEventListener('click', () => {
    cbzDisplayMode = 'double';
    localStorage.setItem('cbzDisplayMode', 'double');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') switchCbzLayout();
  });
}
if (btnLayoutVertical) {
  btnLayoutVertical.addEventListener('click', () => {
    cbzDisplayMode = 'vertical';
    localStorage.setItem('cbzDisplayMode', 'vertical');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') switchCbzLayout();
  });
}

// Fit Mode Buttons
if (btnFitContain) {
  btnFitContain.addEventListener('click', () => {
    cbzFitMode = 'contain';
    localStorage.setItem('cbzFitMode', 'contain');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') switchCbzLayout();
  });
}
if (btnFitWidth) {
  btnFitWidth.addEventListener('click', () => {
    cbzFitMode = 'width';
    localStorage.setItem('cbzFitMode', 'width');
    updateSettingsUI();
    if (currentBook?.type === 'cbz') switchCbzLayout();
  });
}

if (btnDirLtr) {
  btnDirLtr.addEventListener('click', () => {
    cbzReadDirection = 'ltr';
    localStorage.setItem('cbzReadDirection', 'ltr');
    updateSettingsUI();
    if (currentBook?.type === 'cbz' && cbzDisplayMode !== 'vertical') renderCbzPage(currentCbzIndex);
  });
}
if (btnDirRtl) {
  btnDirRtl.addEventListener('click', () => {
    cbzReadDirection = 'rtl';
    localStorage.setItem('cbzReadDirection', 'rtl');
    updateSettingsUI();
    if (currentBook?.type === 'cbz' && cbzDisplayMode !== 'vertical') renderCbzPage(currentCbzIndex);
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

function switchCbzLayout() {
  if (cbzDisplayMode === 'vertical') {
    cbzCarousel.style.display = 'none';
    cbzVertical.style.display = 'block';
    renderCbzVertical(currentCbzIndex);
  } else {
    cbzVertical.style.display = 'none';
    cbzCarousel.style.display = 'block';
    renderCbzPage(currentCbzIndex);
  }
}

// ==========================================
// 3. Fast In-Memory Library & Cover Generator
// ==========================================
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function generateCoverThumbnail(blob) {
  try {
    const zip = await JSZip.loadAsync(blob);
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'];
    const entries = [];
    zip.forEach((path, entry) => {
      if (entry.dir || path.includes('__MACOSX') || path.startsWith('.')) return;
      if (validExts.some(ext => path.toLowerCase().endsWith(ext))) {
        entries.push(path);
      }
    });
    if (entries.length === 0) return null;
    entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const firstEntry = entries[0];
    const imgBlob = await zip.file(firstEntry).async('blob');
    const tempUrl = URL.createObjectURL(imgBlob);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        const canvas = document.createElement('canvas');
        const targetW = 320;
        const targetH = Math.round(targetW * (img.height / img.width)) || 480;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        resolve(null);
      };
      img.src = tempUrl;
    });
  } catch (e) {
    return null;
  }
}

// Delete Action Sheet Controller
const deleteModal = document.getElementById('delete-modal');
const deleteModalTitle = document.getElementById('delete-modal-title');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
let bookPendingDelete = null;

function showDeleteModal(book) {
  bookPendingDelete = book;
  if (deleteModalTitle) deleteModalTitle.textContent = book.name;
  if (deleteModal) deleteModal.style.display = 'flex';
}

function hideDeleteModal() {
  if (deleteModal) deleteModal.style.display = 'none';
  bookPendingDelete = null;
}

if (btnCancelDelete) {
  btnCancelDelete.addEventListener('click', hideDeleteModal);
}
if (deleteModal) {
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) hideDeleteModal();
  });
}
if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', async () => {
    if (!bookPendingDelete) return;
    const id = bookPendingDelete.id;
    hideDeleteModal();
    await dbDeleteBook(id);
    localStorage.removeItem('cover_v2_' + id); localStorage.removeItem('cover_' + id);
    localStorage.removeItem('prog_' + id);
    cachedBooksList = cachedBooksList.filter(b => b.id !== id);
    renderLibraryList();
  });
}

function renderLibraryList() {
  cachedBooksList.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

  bookListEl.innerHTML = '';
  if (cachedBooksList.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  cachedBooksList.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'book-card';

    let progressText = 'Neu';
    if (book.progress) {
      if (book.type === 'cbz' && book.progress.total) {
        progressText = `S. ${book.progress.page + 1}/${book.progress.total}`;
      } else if (book.type === 'epub' && book.progress.percentage !== undefined) {
        progressText = `${Math.round(book.progress.percentage)}%`;
      }
    }

    const coverMarkup = book.cover
      ? `<img class="book-cover" src="${book.cover}" alt="Cover">`
      : `<div class="book-cover-placeholder"><span>📖</span><span>${book.type}</span></div>`;

    card.innerHTML = `
      <div class="book-cover-wrap">
        ${coverMarkup}
        <div class="book-badge-chip ${book.type}">${book.type}</div>
      </div>
      <div class="book-card-info">
        <div class="book-card-title">${book.name}</div>
        <div class="book-card-meta">
          <span>${progressText}</span>
          <span>${formatBytes(book.size)}</span>
        </div>
      </div>
    `;

    // Long-Press to delete detection
    let pressTimer = null;
    let isLongPress = false;
    let startX = 0;
    let startY = 0;

    card.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      isLongPress = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;

      pressTimer = setTimeout(() => {
        isLongPress = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (err) {}
        }
        showDeleteModal(book);
      }, 480);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(pressTimer);
      }
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
    });

    card.addEventListener('click', (e) => {
      if (isLongPress) {
        isLongPress = false;
        return;
      }
      openBook(book.id);
    });

    // Desktop Right-Click Fallback
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showDeleteModal(book);
    });

    bookListEl.appendChild(card);
  });
}

async function loadLibraryFromDisk() {
  const books = await dbGetAllBooks();
  cachedBooksList = books.map(b => {
    const savedProg = localStorage.getItem('prog_' + b.id);
    if (savedProg) {
      try {
        const parsed = JSON.parse(savedProg);
        if (parsed.lastReadAt > (b.lastReadAt || 0)) {
          b.progress = parsed.progress;
          b.lastReadAt = parsed.lastReadAt;
        }
      } catch (e) {}
    }
    const savedCover = localStorage.getItem('cover_v2_' + b.id);
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      size: b.size,
      addedAt: b.addedAt,
      lastReadAt: b.lastReadAt,
      progress: b.progress,
      cover: savedCover || b.cover || null
    };
  });
  renderLibraryList();

  // Asynchronously generate covers for books that don't have one yet
  for (const b of books) {
    if (b.type === 'cbz' && !localStorage.getItem('cover_v2_' + b.id)) {
      generateCoverThumbnail(b.blob).then(coverUrl => {
        if (coverUrl) {
          localStorage.setItem('cover_v2_' + b.id, coverUrl);
          const item = cachedBooksList.find(x => x.id === b.id);
          if (item) {
            item.cover = coverUrl;
            renderLibraryList();
          }
        }
      });
    }
  }
}

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

  // Generate cover thumbnail right away
  let coverDataUrl = null;
  if (type === 'cbz') {
    coverDataUrl = await generateCoverThumbnail(file);
  }

  const bookId = Date.now().toString();
  if (coverDataUrl) {
    localStorage.setItem('cover_v2_' + bookId, coverDataUrl);
  }

  const newBook = {
    id: bookId,
    name: file.name,
    type: type,
    size: file.size,
    blob: file,
    cover: coverDataUrl,
    addedAt: Date.now(),
    lastReadAt: Date.now(),
    progress: { page: 0, total: 0 }
  };

  await dbSaveBook(newBook);
  fileInput.value = '';
  cachedBooksList.unshift({
    id: newBook.id,
    name: newBook.name,
    type: newBook.type,
    size: newBook.size,
    cover: coverDataUrl,
    addedAt: newBook.addedAt,
    lastReadAt: newBook.lastReadAt,
    progress: newBook.progress
  });
  renderLibraryList();
  openBook(newBook.id);
});

// ==========================================
// 4. Reader Controller
// ==========================================
async function openBook(id) {
  loadingIndicator.classList.add('active');
  currentBook = await dbGetBook(id);
  if (!currentBook) {
    loadingIndicator.classList.remove('active');
    return;
  }

  const saved = localStorage.getItem('prog_' + id);
  if (saved) {
    try {
      const p = JSON.parse(saved);
      currentBook.progress = p.progress;
    } catch (e) {}
  }

  readerTitle.textContent = currentBook.name;
  libraryView.style.display = 'none';
  readerView.classList.add('active');
  showOverlay();
  updateSettingsUI();

  if (currentBook.type === 'cbz') {
    epubViewer.style.display = 'none';
    if (cbzDisplayMode === 'vertical') {
      cbzCarousel.style.display = 'none';
      cbzVertical.style.display = 'block';
    } else {
      cbzVertical.style.display = 'none';
      cbzCarousel.style.display = 'block';
    }
    await initCbzReader(currentBook);
  } else if (currentBook.type === 'epub') {
    cbzCarousel.style.display = 'none';
    cbzVertical.style.display = 'none';
    epubViewer.style.display = 'block';
    await initEpubReader(currentBook);
  }

  loadingIndicator.classList.remove('active');
}

function closeReader() {
  readerView.classList.remove('active');
  libraryView.style.display = 'flex';
  renderLibraryList();

  for (const promise of cbzPromiseCache.values()) {
    promise.then(url => { if (url) URL.revokeObjectURL(url); });
  }
  cbzPromiseCache.clear();

  for (let i = 0; i < 3; i++) {
    const img1 = document.getElementById(`p${i}-img1`);
    const img2 = document.getElementById(`p${i}-img2`);
    if (img1) img1.src = '';
    if (img2) img2.src = '';
  }
  cbzVerticalContainer.innerHTML = '';
  resetZoom(false);

  setTimeout(() => {
    currentCbzZip = null;
    currentCbzEntries = [];
    currentBook = null;

    if (currentEpubRendition) {
      try { currentEpubRendition.destroy(); } catch (e) {}
      currentEpubRendition = null;
    }
    if (currentEpubBook) {
      try { currentEpubBook.destroy(); } catch (e) {}
      currentEpubBook = null;
    }
    epubViewer.innerHTML = '';
  }, 40);
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
// 4.5 Jump To Page Modal Controller
// ==========================================
const jumpModal = document.getElementById('jump-modal');
const jumpModalRange = document.getElementById('jump-modal-range');
const jumpInput = document.getElementById('jump-input');
const jumpForm = document.getElementById('jump-form');
const btnCancelJump = document.getElementById('btn-cancel-jump');
const btnConfirmJump = document.getElementById('btn-confirm-jump');

function openJumpModal() {
  if (!currentBook) return;
  let total = 1;
  let current = 1;

  if (currentBook.type === 'cbz') {
    total = currentCbzEntries.length;
    current = currentCbzIndex + 1;
  } else if (currentBook.type === 'epub' && currentEpubBook?.locations) {
    total = Math.max(1, currentEpubBook.locations.length());
    current = Math.round(parseInt(pageSlider.value, 10)) || 1;
  }

  jumpInput.min = 1;
  jumpInput.max = total;
  jumpInput.value = current;
  jumpModalRange.textContent = `Seite 1 bis ${total}`;

  jumpModal.style.display = 'flex';
  setTimeout(() => {
    jumpInput.focus();
    jumpInput.select();
  }, 100);
}

function closeJumpModal() {
  jumpModal.style.display = 'none';
  jumpInput.blur();
}

if (pageInfo) {
  pageInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    openJumpModal();
  });
}

if (btnCancelJump) {
  btnCancelJump.addEventListener('click', closeJumpModal);
}

if (jumpModal) {
  jumpModal.addEventListener('click', (e) => {
    if (e.target === jumpModal) closeJumpModal();
  });
}

function executeJump() {
  const targetPage = parseInt(jumpInput.value, 10);
  closeJumpModal();
  if (isNaN(targetPage) || !currentBook) return;

  if (currentBook.type === 'cbz') {
    const clampedIndex = Math.min(Math.max(1, targetPage), currentCbzEntries.length) - 1;
    if (cbzDisplayMode === 'vertical') {
      const slot = document.getElementById(`v-slot-${clampedIndex}`);
      if (slot) slot.scrollIntoView({ behavior: 'smooth' });
    } else {
      renderCbzPage(clampedIndex);
    }
  } else if (currentBook.type === 'epub' && currentEpubBook) {
    const total = 100;
    const clamped = Math.min(Math.max(1, targetPage), total);
    const cfi = currentEpubBook.locations.cfiFromPercentage((clamped - 1) / total);
    if (cfi) currentEpubRendition.display(cfi);
  }
}

if (jumpForm) {
  jumpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    executeJump();
  });
}
if (btnConfirmJump) {
  btnConfirmJump.addEventListener('click', executeJump);
}

// ==========================================
// 5. CBZ Seamless Track Carousel & Preloader
// ==========================================
async function initCbzReader(book) {
  for (const promise of cbzPromiseCache.values()) {
    promise.then(url => { if (url) URL.revokeObjectURL(url); });
  }
  cbzPromiseCache.clear();

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

  if (cbzDisplayMode === 'vertical') {
    renderCbzVertical(currentCbzIndex);
  } else {
    await renderCbzPage(currentCbzIndex);
  }
}

function fetchPageUrl(index) {
  if (!currentCbzZip || index < 0 || index >= currentCbzEntries.length) return Promise.resolve(null);
  if (cbzPromiseCache.has(index)) return cbzPromiseCache.get(index);

  const promise = (async () => {
    const entryName = currentCbzEntries[index];
    const file = currentCbzZip.file(entryName);
    if (!file) return null;
    try {
      const blob = await file.async('blob');
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      if (img.decode) {
        try { await img.decode(); } catch (e) {}
      }
      return url;
    } catch (err) {
      return null;
    }
  })();

  cbzPromiseCache.set(index, promise);
  return promise;
}

function pruneCbzPromiseCache(centerIndex) {
  for (const [idx, promise] of cbzPromiseCache.entries()) {
    if (Math.abs(idx - centerIndex) > 6) {
      promise.then(url => { if (url) URL.revokeObjectURL(url); });
      cbzPromiseCache.delete(idx);
    }
  }
}

let preloadQueueTimeout = null;
function schedulePreload(centerIndex) {
  clearTimeout(preloadQueueTimeout);
  preloadQueueTimeout = setTimeout(async () => {
    const list = [centerIndex + 1, centerIndex + 2, centerIndex - 1, centerIndex - 2];
    if (cbzDisplayMode === 'double') {
      list.push(centerIndex + 3, centerIndex + 4);
    }
    for (const idx of list) {
      if (idx >= 0 && idx < currentCbzEntries.length && !cbzPromiseCache.has(idx)) {
        await fetchPageUrl(idx);
      }
    }
    pruneCbzPromiseCache(centerIndex);
  }, 80);
}

async function setupPanel(panelNum, pageIndex) {
  const img1 = document.getElementById(`p${panelNum}-img1`);
  const img2 = document.getElementById(`p${panelNum}-img2`);
  const inner = document.getElementById(`panel-${panelNum}-inner`);

  if (!img1 || !img2 || !inner) return;

  if (pageIndex < 0 || pageIndex >= currentCbzEntries.length) {
    img1.src = '';
    img2.src = '';
    img1.style.display = 'none';
    img2.style.display = 'none';
    return;
  }

  const isRtl = (cbzReadDirection === 'rtl');
  inner.style.flexDirection = isRtl ? 'row-reverse' : 'row';

  const isFitWidth = (cbzFitMode === 'width');
  img1.classList.toggle('fit-width', isFitWidth);
  img2.classList.toggle('fit-width', isFitWidth);

  const url1 = await fetchPageUrl(pageIndex);
  img1.src = url1 || '';
  img1.style.display = url1 ? 'block' : 'none';

  if (cbzDisplayMode === 'double' && pageIndex > 0 && pageIndex < currentCbzEntries.length - 1) {
    const url2 = await fetchPageUrl(pageIndex + 1);
    img2.src = url2 || '';
    img2.style.display = url2 ? 'block' : 'none';
    img1.style.maxWidth = '50%';
    img2.style.maxWidth = '50%';
  } else {
    img2.src = '';
    img2.style.display = 'none';
    img1.style.maxWidth = '100%';
  }
}

function getPrevIndex(currIdx) {
  if (currIdx <= 0) return -1;
  const step = (cbzDisplayMode === 'double' && currIdx > 1) ? 2 : 1;
  return Math.max(0, currIdx - step);
}

function getNextIndex(currIdx) {
  if (currIdx >= currentCbzEntries.length - 1) return -1;
  const step = (cbzDisplayMode === 'double' && currIdx > 0) ? 2 : 1;
  return Math.min(currentCbzEntries.length - 1, currIdx + step);
}

async function renderCbzPage(index) {
  if (index < 0 || index >= currentCbzEntries.length) return;

  if (cbzDisplayMode === 'double' && index > 0) {
    if (index % 2 === 0) index = index - 1;
  }

  currentCbzIndex = index;

  cbzTrack.style.transition = 'none';
  cbzTrack.style.transform = 'translateX(-33.333333%)';

  const prevIdx = getPrevIndex(currentCbzIndex);
  const nextIdx = getNextIndex(currentCbzIndex);

  await setupPanel(1, currentCbzIndex);

  if (cbzReadDirection === 'rtl') {
    setupPanel(0, nextIdx);
    setupPanel(2, prevIdx);
  } else {
    setupPanel(0, prevIdx);
    setupPanel(2, nextIdx);
  }

  if (cbzDisplayMode === 'double' && currentCbzIndex > 0 && currentCbzIndex < currentCbzEntries.length - 1) {
    pageSlider.value = currentCbzIndex + 2;
    pageInfo.textContent = `${currentCbzIndex + 1}-${currentCbzIndex + 2} / ${currentCbzEntries.length}`;
  } else {
    pageSlider.value = currentCbzIndex + 1;
    pageInfo.textContent = `${currentCbzIndex + 1} / ${currentCbzEntries.length}`;
  }

  dbUpdateProgress(currentBook.id, { page: currentCbzIndex, total: currentCbzEntries.length });
  resetZoom(false);

  schedulePreload(currentCbzIndex);
}

function cbzNext() {
  if (cbzDisplayMode === 'vertical') {
    scrollVerticalBy(window.innerHeight * 0.8);
    return;
  }
  const nextIdx = getNextIndex(currentCbzIndex);
  if (nextIdx !== -1) {
    animateSlideTo(cbzReadDirection === 'rtl' ? 'prev' : 'next', nextIdx);
  }
}

function cbzPrev() {
  if (cbzDisplayMode === 'vertical') {
    scrollVerticalBy(-window.innerHeight * 0.8);
    return;
  }
  const prevIdx = getPrevIndex(currentCbzIndex);
  if (prevIdx !== -1) {
    animateSlideTo(cbzReadDirection === 'rtl' ? 'next' : 'prev', prevIdx);
  }
}

function animateSlideTo(direction, targetIdx) {
  cbzTrack.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
  cbzTrack.style.transform = direction === 'next' ? 'translateX(-66.666667%)' : 'translateX(0%)';
  setTimeout(() => {
    renderCbzPage(targetIdx);
  }, 220);
}

// ==========================================
// 5.5 Vertical Webtoon Scrolling Engine
// ==========================================
let verticalObserver = null;

function renderCbzVertical(startIndex) {
  cbzVerticalContainer.innerHTML = '';
  if (verticalObserver) {
    verticalObserver.disconnect();
  }

  const isFitContain = (cbzFitMode === 'contain');

  currentCbzEntries.forEach((_, idx) => {
    const slot = document.createElement('div');
    slot.className = 'vertical-page-slot';
    slot.dataset.index = idx;
    slot.id = `v-slot-${idx}`;

    const img = document.createElement('img');
    img.className = 'vertical-comic-img' + (isFitContain ? ' fit-contain' : '');
    slot.appendChild(img);
    cbzVerticalContainer.appendChild(slot);
  });

  verticalObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const idx = parseInt(entry.target.dataset.index, 10);
      const img = entry.target.querySelector('img');

      if (entry.isIntersecting) {
        fetchPageUrl(idx).then(url => {
          if (url && img) img.src = url;
        });
        if (entry.intersectionRatio > 0.45) {
          currentCbzIndex = idx;
          pageSlider.value = idx + 1;
          pageInfo.textContent = `${idx + 1} / ${currentCbzEntries.length}`;
          dbUpdateProgress(currentBook.id, { page: idx, total: currentCbzEntries.length });
        }
      } else {
        // Clear offscreen images far away
        const rect = entry.target.getBoundingClientRect();
        if (Math.abs(rect.top) > window.innerHeight * 3) {
          if (img) img.src = '';
        }
      }
    });
  }, {
    root: cbzVertical,
    rootMargin: '800px 0px 800px 0px',
    threshold: [0, 0.5]
  });

  cbzVerticalContainer.querySelectorAll('.vertical-page-slot').forEach(slot => {
    verticalObserver.observe(slot);
  });

  setTimeout(() => {
    const targetSlot = document.getElementById(`v-slot-${startIndex}`);
    if (targetSlot) {
      targetSlot.scrollIntoView();
    }
  }, 50);
}

function scrollVerticalBy(amount) {
  cbzVertical.scrollBy({ top: amount, behavior: 'smooth' });
}

cbzVertical.addEventListener('click', (e) => {
  if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .settings-modal')) return;
  const width = window.innerWidth;
  // If tapped within middle 50%
  if (e.clientX > width * 0.25 && e.clientX < width * 0.75) {
    toggleOverlay();
  }
});

pageSlider.addEventListener('input', (e) => {
  if (currentBook && currentBook.type === 'cbz') {
    const targetIndex = parseInt(e.target.value, 10) - 1;
    if (cbzDisplayMode === 'vertical') {
      const targetSlot = document.getElementById(`v-slot-${targetIndex}`);
      if (targetSlot) targetSlot.scrollIntoView();
    } else {
      renderCbzPage(targetIndex);
    }
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
// 7. Navigation, Focal Zoom & Track Swipe Engine
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

// Zoom & Focal Pan State
let currentZoom = 1;
let panX = 0;
let panY = 0;
let initialPanX = 0;
let initialPanY = 0;
let contentFocalX = 0;
let contentFocalY = 0;

function applyViewerTransform(animated = false) {
  if (!panel1Inner) return;
  if (animated) {
    panel1Inner.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
  } else {
    panel1Inner.style.transition = 'none';
  }
  panel1Inner.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function resetZoom(animated = true) {
  currentZoom = 1;
  panX = 0;
  panY = 0;
  applyViewerTransform(animated);
}

// Touch & Gesture Tracking
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouching = false;
let isSwiping = false;
let isPinching = false;
let initialPinchDist = 0;
let startZoom = 1;

let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;

readerView.addEventListener('touchstart', (e) => {
  if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .settings-modal')) return;
  if (cbzDisplayMode === 'vertical') return;

  // 1. PINCH-TO-ZOOM AROUND FINGERS
  if (e.touches.length === 2 && currentBook?.type === 'cbz') {
    isPinching = true;
    isTouching = false;
    isSwiping = false;

    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    startZoom = currentZoom;

    const rect = readerCanvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;

    contentFocalX = (midX - centerX - panX) / currentZoom;
    contentFocalY = (midY - centerY - panY) / currentZoom;
    return;
  }

  // 2. SINGLE TOUCH
  if (e.touches.length === 1) {
    isPinching = false;
    isTouching = true;
    isSwiping = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    initialPanX = panX;
    initialPanY = panY;
  }
}, { passive: true });

readerView.addEventListener('touchmove', (e) => {
  if (cbzDisplayMode === 'vertical') return;

  // Pinching
  if (isPinching && e.touches.length === 2 && currentBook?.type === 'cbz') {
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const scaleFactor = currentDist / (initialPinchDist || 1);
    currentZoom = Math.min(Math.max(1, startZoom * scaleFactor), 4.5);

    const rect = readerCanvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;

    panX = midX - centerX - contentFocalX * currentZoom;
    panY = midY - centerY - contentFocalY * currentZoom;

    applyViewerTransform(false);
    return;
  }

  if (!isTouching || e.touches.length !== 1) return;

  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;

  // Panning when zoomed in
  if (currentZoom > 1.05 && currentBook?.type === 'cbz') {
    e.preventDefault();
    panX = initialPanX + dx;
    panY = initialPanY + dy;
    applyViewerTransform(false);
    return;
  }

  // 1:1 Seamless Track Dragging
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    isSwiping = true;
  }

  if (Math.abs(dx) > Math.abs(dy) && currentBook?.type === 'cbz') {
    e.preventDefault();
    cbzTrack.style.transition = 'none';
    cbzTrack.style.transform = `translateX(calc(-33.333333% + ${dx}px))`;
  }
}, { passive: false });

readerView.addEventListener('touchend', (e) => {
  if (cbzDisplayMode === 'vertical') return;

  if (isPinching) {
    if (e.touches.length < 2) isPinching = false;
    if (currentZoom < 1.05) {
      resetZoom(true);
    }
    return;
  }

  if (!isTouching) return;
  isTouching = false;

  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const dt = Date.now() - touchStartTime;

  if (currentZoom > 1.05 && currentBook?.type === 'cbz') {
    return;
  }

  const screenWidth = window.innerWidth;
  const swipeThreshold = screenWidth * 0.16;
  const isFlick = (Math.abs(dx) > 35 && dt < 280);

  // 1. CAROUSEL SWIPE RELEASE
  if (isSwiping && (Math.abs(dx) > swipeThreshold || isFlick) && Math.abs(dx) > Math.abs(dy)) {
    if (currentBook?.type === 'cbz') {
      const isRtl = (cbzReadDirection === 'rtl');
      const draggedLeft = (dx < 0);

      let targetIdx = -1;
      let targetPanel = '';

      if (draggedLeft) {
        targetIdx = isRtl ? getPrevIndex(currentCbzIndex) : getNextIndex(currentCbzIndex);
        targetPanel = 'next';
      } else {
        targetIdx = isRtl ? getNextIndex(currentCbzIndex) : getPrevIndex(currentCbzIndex);
        targetPanel = 'prev';
      }

      if (targetIdx !== -1) {
        animateSlideTo(targetPanel, targetIdx);
      } else {
        cbzTrack.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
        cbzTrack.style.transform = 'translateX(-33.333333%)';
      }
    } else {
      (dx < 0) ? navigateNext() : navigatePrev();
    }
    return;
  }

  if (isSwiping && currentBook?.type === 'cbz') {
    cbzTrack.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
    cbzTrack.style.transform = 'translateX(-33.333333%)';
    return;
  }

  // 2. DOUBLE TAP TO ZOOM
  const now = Date.now();
  if (now - lastTapTime < 320 && Math.abs(touch.clientX - lastTapX) < 35 && Math.abs(touch.clientY - lastTapY) < 35) {
    lastTapTime = 0;
    if (currentBook?.type === 'cbz') {
      if (currentZoom > 1.05) {
        resetZoom(true);
      } else {
        currentZoom = 2.4;
        const rect = readerCanvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const focalX = (touch.clientX - centerX - panX) / 1;
        const focalY = (touch.clientY - centerY - panY) / 1;
        panX = touch.clientX - centerX - focalX * currentZoom;
        panY = touch.clientY - centerY - focalY * currentZoom;
        applyViewerTransform(true);
      }
    }
    return;
  }
  lastTapTime = now;
  lastTapX = touch.clientX;
  lastTapY = touch.clientY;

  // 3. SINGLE TAP (Large Center Zone)
  const isMangaRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  if (touch.clientX < screenWidth * 0.28) {
    isMangaRtl ? navigateNext() : navigatePrev();
  } else if (touch.clientX > screenWidth * 0.72) {
    isMangaRtl ? navigatePrev() : navigateNext();
  } else {
    toggleOverlay();
  }
});

readerView.addEventListener('click', (e) => {
  if (e.target.closest('.reader-top-bar, .reader-bottom-bar, .settings-modal')) return;
  if ('ontouchstart' in window) return;

  const screenWidth = window.innerWidth;
  const isMangaRtl = (currentBook && currentBook.type === 'cbz' && cbzReadDirection === 'rtl');
  if (e.clientX < screenWidth * 0.28) {
    isMangaRtl ? navigateNext() : navigatePrev();
  } else if (e.clientX > screenWidth * 0.72) {
    isMangaRtl ? navigatePrev() : navigateNext();
  } else {
    toggleOverlay();
  }
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
// 8. Pull-To-Refresh
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
loadLibraryFromDisk();
