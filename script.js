(() => {
  'use strict';

  const FORMAT_CATEGORIES = {
    common: { label: 'Common Formats', icon: '&#9733;', iconClass: 'format-group-icon--common' },
    modern: { label: 'Modern Formats', icon: '&#9889;', iconClass: 'format-group-icon--modern' },
    pro: { label: 'Professional', icon: '&#9878;', iconClass: 'format-group-icon--pro' },
    apple: { label: 'Apple', icon: '&#63743;', iconClass: 'format-group-icon--apple' },
    vector: { label: 'Vector', icon: '&#9998;', iconClass: 'format-group-icon--vector' },
    document: { label: 'Document', icon: '&#9993;', iconClass: 'format-group-icon--document' },
    raw: { label: 'Camera RAW', icon: '&#9781;', iconClass: 'format-group-icon--raw' },
    legacy: { label: 'Legacy & Specialty', icon: '&#9881;', iconClass: 'format-group-icon--legacy' },
  };

  const FORMAT_EXTENSIONS = {
    jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WebP', avif: 'AVIF',
    tiff: 'TIFF', tif: 'TIFF', bmp: 'BMP', ico: 'ICO', heic: 'HEIC', heif: 'HEIF',
    svg: 'SVG', svgz: 'SVGZ', raw: 'RAW', cr2: 'CR2', nef: 'NEF', arw: 'ARW', dng: 'DNG',
    orf: 'ORF', raf: 'RAF', rw2: 'RW2', pef: 'PEF', jp2: 'JP2', j2k: 'J2K',
    tga: 'TGA', dds: 'DDS', exr: 'EXR', hdr: 'HDR', pbm: 'PBM', pgm: 'PGM',
    ppm: 'PPM', qoi: 'QOI', jxl: 'JXL', pdf: 'PDF',
  };

  const OUTPUT_FORMATS = [
    { id: 'jpg', name: 'JPEG', cat: 'common' },
    { id: 'png', name: 'PNG', cat: 'common' },
    { id: 'gif', name: 'GIF', cat: 'common' },
    { id: 'bmp', name: 'BMP', cat: 'common' },
    { id: 'ico', name: 'ICO', cat: 'common' },
    { id: 'webp', name: 'WebP', cat: 'modern' },
    { id: 'avif', name: 'AVIF', cat: 'modern' },
    { id: 'qoi', name: 'QOI', cat: 'modern' },
    { id: 'jxl', name: 'JPEG XL', cat: 'modern' },
    { id: 'tiff', name: 'TIFF', cat: 'pro' },
    { id: 'heic', name: 'HEIC', cat: 'apple' },
    { id: 'hdr', name: 'Radiance HDR', cat: 'pro' },
    { id: 'exr', name: 'OpenEXR', cat: 'pro' },
    { id: 'ppm', name: 'PPM', cat: 'legacy' },
    { id: 'pgm', name: 'PGM', cat: 'legacy' },
    { id: 'pbm', name: 'PBM', cat: 'legacy' },
    { id: 'jp2', name: 'JPEG 2000', cat: 'legacy' },
  ];

  let files = [];
  let jobs = [];
  let selectedFormat = null;
  let polling = false;
  let pollTimer = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function init() {
    renderFormatGrid();
    renderFormatOptions();
    setupDropZone();
    setupFormatSelector();
    setupActions();
    checkHealth();
  }

  // ── Health Check ────────────────────────────────────────

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      const indicator = $('#healthIndicator');
      const dot = $('#healthDot');
      const text = $('#healthText');

      if (data.status === 'ok') {
        const libs = ['sharp', 'heic', 'archiver', 'pdf', 'bmp', 'tga', 'netpbm', 'qoi', 'ico', 'hdr', 'dds', 'dcraw', 'openjpeg', 'jxl'];
        const unavailable = libs.filter((k) => data[k] === false);
        const total = libs.length;

        if (unavailable.length === 0) {
          indicator.className = 'health-pill';
          dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
          text.textContent = 'Ready';
          indicator.title = 'All systems operational — 14/14 codecs available';
        } else if (unavailable.length < total / 2) {
          indicator.className = 'health-pill degraded';
          dot.className = 'w-2 h-2 rounded-full bg-amber-400';
          text.textContent = 'Degraded';
          indicator.title = `${unavailable.length} codec${unavailable.length > 1 ? 's' : ''} unavailable: ${unavailable.join(', ')}`;
        } else {
          indicator.className = 'health-pill offline';
          dot.className = 'w-2 h-2 rounded-full bg-red-400';
          text.textContent = 'Error';
          indicator.title = `${unavailable.length} codecs unavailable: ${unavailable.join(', ')}`;
        }
      } else {
        indicator.className = 'health-pill offline';
        dot.className = 'w-2 h-2 rounded-full bg-red-400';
        text.textContent = 'Error';
        indicator.title = 'Server returned an error';
      }
    } catch {
      const indicator = $('#healthIndicator');
      const dot = $('#healthDot');
      const text = $('#healthText');
      indicator.className = 'health-pill offline';
      dot.className = 'w-2 h-2 rounded-full bg-red-400';
      text.textContent = 'Offline';
      indicator.title = 'Cannot reach server — check if it is running';
    }
  }

  // ── Drop Zone ───────────────────────────────────────────

  function setupDropZone() {
    const zone = $('#dropZone');
    const input = $('#fileInput');

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', (e) => {
      addFiles(e.target.files);
      input.value = '';
    });
  }

  // ── File Management ─────────────────────────────────────

  function addFiles(fileList) {
    const validExts = Object.keys(FORMAT_EXTENSIONS);
    let added = 0;

    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!validExts.includes(ext)) {
        showToast(`Skipped "${file.name}" — unsupported format`, 'error');
        continue;
      }

      const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fileEntry = {
        id,
        file,
        name: file.name,
        size: file.size,
        ext,
        preview: null,
        jobId: null,
        status: 'pending',
        progress: 0,
        outputSize: null,
        error: null,
      };

      generatePreview(fileEntry);
      files.push(fileEntry);
      added++;
    }

    if (added > 0) {
      updateUI();
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      showToast(`${added} file${added > 1 ? 's' : ''} added (${formatSize(totalSize)} total)`, 'success');
    }
  }

  function generatePreview(entry) {
    if (entry.ext === 'svg' || entry.ext === 'svgz') {
      const reader = new FileReader();
      reader.onload = (e) => { entry.preview = e.target.result; };
      reader.readAsDataURL(entry.file);
      return;
    }

    if (['heic', 'heif', 'raw', 'cr2', 'nef', 'arw', 'dng', 'orf', 'raf', 'rw2', 'pef', 'dds', 'exr', 'hdr', 'pdf'].includes(entry.ext)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 88;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        entry.preview = canvas.toDataURL('image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(entry.file);
  }

  function removeFile(id) {
    const el = document.querySelector(`[data-file-id="${id}"]`);
    if (el) {
      el.classList.add('removing');
      setTimeout(() => {
        files = files.filter((f) => f.id !== id);
        updateUI();
      }, 200);
    } else {
      files = files.filter((f) => f.id !== id);
      updateUI();
    }
  }

  function clearAllFiles() {
    files = [];
    jobs = [];
    selectedFormat = null;
    polling = false;
    if (pollTimer) clearInterval(pollTimer);
    updateUI();
    $('#formatButtonText').textContent = 'Select output format...';
    $('#formatButtonText').className = 'text-zinc-400';
    $$('.format-option').forEach((o) => o.classList.remove('active'));
  }

  // ── UI Updates ──────────────────────────────────────────

  function updateUI() {
    const hasFiles = files.length > 0;
    const hasSelectedFormat = selectedFormat !== null;
    const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'error');
    const hasFailed = files.some((f) => f.status === 'error');
    const hasCompleted = files.some((f) => f.status === 'done');
    const isConverting = files.some((f) => f.status === 'converting' || f.status === 'queued');

    // Show/hide sections
    $('#actionsSection').classList.toggle('hidden', !hasFiles);
    $('#queueSection').classList.toggle('hidden', !hasFiles);
    $('#bulkActions').classList.toggle('hidden', !hasFiles);

    // File count
    if (hasFiles) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      $('#fileCount').textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected (${formatSize(totalSize)} total)`;
    }

    // Convert button
    const convertBtn = $('#convertBtn');
    const convertIcon = convertBtn.querySelector('.convert-icon');
    const convertSpinner = convertBtn.querySelector('.convert-spinner');
    const convertLabel = convertBtn.querySelector('.convert-label');

    if (isConverting) {
      convertBtn.disabled = true;
      convertBtn.classList.add('converting');
      convertIcon.classList.add('hidden');
      convertSpinner.classList.remove('hidden');
      convertLabel.textContent = 'Converting...';
    } else {
      convertBtn.classList.remove('converting');
      convertIcon.classList.remove('hidden');
      convertSpinner.classList.add('hidden');
      convertLabel.textContent = 'Convert';
      convertBtn.disabled = !hasFiles || !hasSelectedFormat;
    }

    // Format button state
    const formatBtn = $('#formatButton');
    formatBtn.classList.toggle('has-value', hasSelectedFormat);

    // Clear button
    $('#clearBtn').style.display = isConverting ? 'none' : '';

    // Bulk actions
    const downloadAllBtn = $('#downloadAllBtn');
    const retryAllBtn = $('#retryAllBtn');
    const resetBtn = $('#resetBtn');
    const bulkStatus = $('#bulkStatus');
    const progressRing = $('#bulkProgressRing');

    downloadAllBtn.classList.toggle('hidden', !hasCompleted || isConverting);
    retryAllBtn.classList.toggle('hidden', !hasFailed || isConverting);
    resetBtn.classList.toggle('hidden', isConverting || !allDone);

    if (isConverting) {
      const converting = files.filter((f) => f.status === 'converting').length;
      const queued = files.filter((f) => f.status === 'queued').length;
      const done = files.filter((f) => f.status === 'done').length;
      bulkStatus.textContent = `Converting... ${done}/${files.length} complete`;
      progressRing.classList.remove('hidden');
    } else if (allDone) {
      const done = files.filter((f) => f.status === 'done').length;
      const failed = files.filter((f) => f.status === 'error').length;
      bulkStatus.textContent = failed > 0
        ? `${done} complete, ${failed} failed`
        : `All ${done} file${done > 1 ? 's' : ''} converted successfully`;
      progressRing.classList.add('hidden');
    } else {
      progressRing.classList.add('hidden');
    }

    renderQueue();
  }

  function renderQueue() {
    const container = $('#fileQueue');
    container.innerHTML = files.map((f, i) => {
      const ext = f.ext.toUpperCase();
      const statusColor = {
        pending: 'text-zinc-500',
        queued: 'text-zinc-400',
        converting: 'text-brand',
        done: 'text-emerald-400',
        error: 'text-red-400',
      }[f.status] || 'text-zinc-500';

      const statusDot = `<span class="status-dot status-dot--${f.status}"></span>`;

      const statusText = {
        pending: 'Ready',
        queued: 'In queue',
        converting: 'Converting...',
        done: 'Done',
        error: f.error || 'Failed',
      }[f.status] || '';

      const progressWidth = f.status === 'done' ? 100 : f.status === 'error' ? 100 : f.progress;
      const progressClass = f.status === 'done' ? 'complete' : f.status === 'error' ? 'error' : '';

      const thumbHtml = f.preview
        ? `<img src="${f.preview}" alt="${f.name}" class="file-thumb" loading="lazy">`
        : `<div class="file-thumb-placeholder">${ext.slice(0, 4)}</div>`;

      const actionHtml = f.status === 'done'
        ? `<button class="download-btn p-2 rounded-lg hover:bg-zinc-700/50 text-emerald-400 hover:text-emerald-300 transition-colors" data-job-id="${f.jobId}" title="Download">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
           </button>`
        : f.status === 'error'
        ? `<button class="retry-btn p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-colors" data-file-id="${f.id}" title="Retry">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
           </button>`
        : '';

      const outputBadge = selectedFormat
        ? `<span class="format-badge output">→ ${selectedFormat.toUpperCase()}</span>`
        : '';

      const itemClass = f.status === 'done' ? 'file-item done' : f.status === 'error' ? 'file-item error' : 'file-item';

      return `
        <div class="${itemClass} bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 sm:p-4" data-file-id="${f.id}" style="animation-delay: ${i * 30}ms">
          <div class="flex items-center gap-3 sm:gap-4">
            <div class="flex-shrink-0">${thumbHtml}</div>
            <div class="file-info flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="file-name text-sm font-medium text-zinc-200 truncate max-w-[180px] sm:max-w-xs" title="${f.name}">${f.name}</span>
                <span class="format-badge">${ext}</span>
                ${outputBadge}
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-zinc-500">${formatSize(f.size)}</span>
                ${f.outputSize ? `<span class="text-zinc-600">→ ${formatSize(f.outputSize)}</span>` : ''}
                ${statusDot} <span class="${statusColor}">${statusText}</span>
              </div>
              ${(f.status === 'converting' || f.status === 'queued') ? `
              <div class="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div class="progress-bar ${progressClass} h-full rounded-full" style="width: ${progressWidth}%"></div>
              </div>` : ''}
              ${f.status === 'done' ? `
              <div class="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div class="progress-bar complete h-full rounded-full" style="width: 100%"></div>
              </div>` : ''}
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              ${actionHtml}
              <button class="remove-btn p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors" data-file-id="${f.id}" title="Remove">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.fileId;
        const file = files.find((f) => f.id === id);
        if (file && (file.status === 'converting' || file.status === 'queued')) {
          showToast('Cannot remove file while converting', 'error');
          return;
        }
        removeFile(id);
      });
    });

    container.querySelectorAll('.download-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(btn.dataset.jobId);
      });
    });

    container.querySelectorAll('.retry-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        retryFile(btn.dataset.fileId);
      });
    });
  }

  // ── Format Selector ─────────────────────────────────────

  function renderFormatOptions() {
    const container = $('#formatOptions');
    const categories = {};

    OUTPUT_FORMATS.forEach((fmt) => {
      if (!categories[fmt.cat]) categories[fmt.cat] = [];
      categories[fmt.cat].push(fmt);
    });

    let html = '';
    for (const [catKey, catInfo] of Object.entries(FORMAT_CATEGORIES)) {
      if (!categories[catKey]) continue;
      html += `<div class="px-2 pt-2 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">${catInfo.label}</div>`;
      categories[catKey].forEach((fmt) => {
        html += `
          <div class="format-option flex items-center gap-3 px-3 py-2 mx-1 rounded-lg" data-format="${fmt.id}" role="option" tabindex="0">
            <span class="format-ext w-10 text-center text-zinc-400">${fmt.id.toUpperCase()}</span>
            <span class="text-sm text-zinc-300">${fmt.name}</span>
          </div>`;
      });
    }

    container.innerHTML = html;

    container.querySelectorAll('.format-option').forEach((opt) => {
      opt.addEventListener('click', () => selectFormat(opt.dataset.format));
      opt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectFormat(opt.dataset.format);
        }
      });
    });
  }

  function setupFormatSelector() {
    const button = $('#formatButton');
    const dropdown = $('#formatDropdown');
    const search = $('#formatSearch');
    const chevron = $('#formatChevron');

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      dropdown.classList.toggle('hidden');
      chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      if (!isOpen) {
        search.value = '';
        filterFormats('');
        setTimeout(() => search.focus(), 50);
      }
    });

    search.addEventListener('input', (e) => filterFormats(e.target.value));

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        chevron.style.transform = '';
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.classList.add('hidden');
        chevron.style.transform = '';
      }
    });
  }

  function filterFormats(query) {
    const options = $$('.format-option');
    const q = query.toLowerCase();
    options.forEach((opt) => {
      const text = opt.textContent.toLowerCase();
      const ext = opt.dataset.format;
      opt.style.display = text.includes(q) || ext.includes(q) ? '' : 'none';
    });
  }

  function selectFormat(formatId) {
    selectedFormat = formatId;
    const fmt = OUTPUT_FORMATS.find((f) => f.id === formatId);

    $('#formatButtonText').textContent = `${fmt.name} (.${formatId})`;
    $('#formatButtonText').className = 'text-zinc-100 font-medium';

    $$('.format-option').forEach((o) => o.classList.toggle('active', o.dataset.format === formatId));

    $('#formatDropdown').classList.add('hidden');
    $('#formatChevron').style.transform = '';

    updateUI();
    showToast(`Output format set to ${fmt.name}`, 'success');
  }

  // ── Actions ─────────────────────────────────────────────

  function setupActions() {
    $('#convertBtn').addEventListener('click', startConversion);
    $('#clearBtn').addEventListener('click', clearAllFiles);
    $('#downloadAllBtn').addEventListener('click', downloadAll);
    $('#retryAllBtn').addEventListener('click', retryAllFailed);
    $('#resetBtn').addEventListener('click', clearAllFiles);
  }

  async function startConversion() {
    if (!selectedFormat || files.length === 0) return;

    const pending = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pending.length === 0) return;

    pending.forEach((f) => {
      f.status = 'queued';
      f.progress = 0;
      f.error = null;
    });

    updateUI();
    showToast(`Starting conversion of ${pending.length} file${pending.length > 1 ? 's' : ''}...`, 'info');

    const formData = new FormData();
    pending.forEach((f) => formData.append('files', f.file));
    formData.append('format', selectedFormat);

    try {
      const res = await fetch('/api/convert', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.error) {
        showToast(data.error, 'error');
        pending.forEach((f) => { f.status = 'error'; f.error = data.error; });
        updateUI();
        return;
      }

      data.jobIds.forEach((jobId, i) => {
        if (pending[i]) {
          pending[i].jobId = jobId;
          pending[i].status = 'queued';
        }
      });

      updateUI();
      startPolling();
    } catch (err) {
      showToast('Upload failed. Check your connection.', 'error');
      pending.forEach((f) => { f.status = 'error'; f.error = 'Upload failed'; });
      updateUI();
    }
  }

  // ── Polling ─────────────────────────────────────────────

  function startPolling() {
    if (polling) return;
    polling = true;
    poll();
    pollTimer = setInterval(poll, 600);
  }

  function stopPolling() {
    polling = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function poll() {
    const activeIds = files
      .filter((f) => f.jobId && (f.status === 'queued' || f.status === 'converting'))
      .map((f) => f.jobId);

    if (activeIds.length === 0) {
      stopPolling();
      updateUI();
      return;
    }

    try {
      const res = await fetch(`/api/status?ids=${activeIds.join(',')}`);
      const statuses = await res.json();

      statuses.forEach((s) => {
        const file = files.find((f) => f.jobId === s.id);
        if (file) {
          file.status = s.status;
          file.progress = s.progress;
          file.outputSize = s.outputSize;
          file.error = s.error;
        }
      });

      updateUI();

      if (activeIds.length === 0) stopPolling();
    } catch (err) {
      console.error('Poll error:', err);
    }
  }

  // ── Downloads ───────────────────────────────────────────

  function downloadFile(jobId) {
    const a = document.createElement('a');
    a.href = `/api/download/${jobId}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download started', 'success');
  }

  function downloadAll() {
    const doneIds = files.filter((f) => f.status === 'done' && f.jobId).map((f) => f.jobId);
    if (doneIds.length === 0) return;

    if (doneIds.length === 1) {
      downloadFile(doneIds[0]);
      return;
    }

    const a = document.createElement('a');
    a.href = `/api/download-all?ids=${doneIds.join(',')}`;
    a.download = 'imageforge-converted.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloading ZIP archive...', 'info');
  }

  // ── Retry ───────────────────────────────────────────────

  function retryFile(fileId) {
    const file = files.find((f) => f.id === fileId);
    if (!file || file.status !== 'error') return;

    file.status = 'pending';
    file.progress = 0;
    file.error = null;
    file.jobId = null;
    updateUI();

    if (selectedFormat) {
      startConversion();
    }
  }

  function retryAllFailed() {
    const failed = files.filter((f) => f.status === 'error');
    failed.forEach((f) => {
      f.status = 'pending';
      f.progress = 0;
      f.error = null;
      f.jobId = null;
    });
    updateUI();

    if (selectedFormat) {
      startConversion();
    }
  }

  // ── Format Grid ─────────────────────────────────────────

  const INPUT_FORMATS = [
    { ext: 'jpg',  name: 'JPEG',        cat: 'common',  supported: true },
    { ext: 'jpeg', name: 'JPEG',        cat: 'common',  supported: true },
    { ext: 'png',  name: 'PNG',         cat: 'common',  supported: true },
    { ext: 'gif',  name: 'GIF',         cat: 'common',  supported: true },
    { ext: 'webp', name: 'WebP',        cat: 'modern',  supported: true },
    { ext: 'avif', name: 'AVIF',        cat: 'modern',  supported: true },
    { ext: 'tiff', name: 'TIFF',        cat: 'pro',     supported: true },
    { ext: 'heic', name: 'HEIC',        cat: 'apple',   supported: true },
    { ext: 'heif', name: 'HEIF',        cat: 'apple',   supported: true },
    { ext: 'svg',  name: 'SVG',         cat: 'vector',  supported: true },
    { ext: 'svgz', name: 'SVGZ',        cat: 'vector',  supported: true },
    { ext: 'pdf',  name: 'PDF',         cat: 'document',supported: true },
    { ext: 'bmp',  name: 'BMP',         cat: 'common',  supported: true },
    { ext: 'tga',  name: 'Targa',       cat: 'legacy',  supported: true },
    { ext: 'pbm',  name: 'PBM',         cat: 'legacy',  supported: true },
    { ext: 'pgm',  name: 'PGM',         cat: 'legacy',  supported: true },
    { ext: 'ppm',  name: 'PPM',         cat: 'legacy',  supported: true },
    { ext: 'qoi',  name: 'QOI',         cat: 'modern',  supported: true },
    { ext: 'hdr',  name: 'Radiance HDR',cat: 'pro',     supported: true },
    { ext: 'exr',  name: 'OpenEXR',     cat: 'pro',     supported: true },
    { ext: 'dds',  name: 'DDS',         cat: 'legacy',  supported: true },
    { ext: 'cr2',  name: 'Canon CR2',   cat: 'raw',     supported: true },
    { ext: 'nef',  name: 'Nikon NEF',   cat: 'raw',     supported: true },
    { ext: 'arw',  name: 'Sony ARW',    cat: 'raw',     supported: true },
    { ext: 'dng',  name: 'Adobe DNG',   cat: 'raw',     supported: true },
    { ext: 'orf',  name: 'Olympus ORF', cat: 'raw',     supported: true },
    { ext: 'raf',  name: 'Fuji RAF',    cat: 'raw',     supported: true },
    { ext: 'rw2',  name: 'Panasonic RW2',cat: 'raw',    supported: true },
    { ext: 'pef',  name: 'Pentax PEF',  cat: 'raw',     supported: true },
    { ext: 'raw',  name: 'RAW',         cat: 'raw',     supported: true },
    { ext: 'jp2',  name: 'JPEG 2000',   cat: 'legacy',  supported: true },
    { ext: 'j2k',  name: 'JPEG 2000',   cat: 'legacy',  supported: true },
    { ext: 'jxl',  name: 'JPEG XL',     cat: 'modern',  supported: true },
  ];

  function renderFormatGrid() {
    const grid = $('#formatGrid');
    const groups = {};

    INPUT_FORMATS.forEach((f) => {
      if (!groups[f.cat]) groups[f.cat] = [];
      groups[f.cat].push(f);
    });

    let html = '';
    let tagIndex = 0;

    const categoryOrder = ['common', 'modern', 'pro', 'apple', 'vector', 'document', 'raw', 'legacy'];

    for (const catKey of categoryOrder) {
      const items = groups[catKey];
      if (!items || items.length === 0) continue;

      const catInfo = FORMAT_CATEGORIES[catKey];
      html += `
        <div class="format-group">
          <div class="format-group-header">
            <div class="format-group-icon ${catInfo.iconClass}">${catInfo.icon}</div>
            <span class="format-group-label">${catInfo.label}</span>
            <span class="format-group-count">${items.length} format${items.length > 1 ? 's' : ''}</span>
          </div>
          <div class="format-group-body">`;

      items.forEach((f) => {
        const delay = (tagIndex * 15) + 'ms';
        html += `
            <div class="format-tag" style="animation-delay: ${delay}" title="${f.name} (.${f.ext})">
              <span class="format-tag-ext">${f.ext.toUpperCase()}</span>
              <span class="format-tag-name">${f.name}</span>
            </div>`;
        tagIndex++;
      });

      html += `
          </div>
        </div>`;
    }

    // Output formats group
    html += `
      <div class="format-group">
        <div class="format-group-header">
          <div class="format-group-icon format-group-icon--common">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <span class="format-group-label">Output Formats</span>
          <span class="format-group-count">${OUTPUT_FORMATS.length} formats</span>
        </div>
        <div class="format-group-body">`;

    OUTPUT_FORMATS.forEach((f) => {
      const delay = (tagIndex * 15) + 'ms';
      html += `
            <div class="format-tag output" style="animation-delay: ${delay}" title="${f.name} — Output format">
              <span class="format-tag-ext">${f.id.toUpperCase()}</span>
              <span class="format-tag-name">${f.name}</span>
            </div>`;
      tagIndex++;
    });

    html += `
          </div>
        </div>`;

    grid.innerHTML = html;
  }

  // ── Toasts ──────────────────────────────────────────────

  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');

    const colors = {
      success: 'border-emerald-500/30 bg-emerald-500/10',
      error: 'border-red-500/30 bg-red-500/10',
      info: 'border-zinc-700/50 bg-zinc-800/90',
    };

    const icons = {
      success: '<svg class="w-4 h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
      error: '<svg class="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg class="w-4 h-4 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    };

    toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg ${colors[type] || colors.info}`;
    toast.innerHTML = `${icons[type] || icons.info}<span class="text-sm text-zinc-200">${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }

  // ── Utilities ───────────────────────────────────────────

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  // ── Keyboard Navigation ─────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const dropdown = $('#formatDropdown');
      if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        $('#formatChevron').style.transform = '';
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const convertBtn = $('#convertBtn');
      if (!convertBtn.disabled) convertBtn.click();
    }
  });

  // ── Init ────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);
})();
