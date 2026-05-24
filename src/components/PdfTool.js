import { PDFDocument, PDFName } from 'pdf-lib';
import { createDropzone } from './Dropzone.js';
import { clearMetadataTable, renderMetadataTable } from './MetadataTable.js';

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return 'Not set';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dateValue);
}

function isLikelyPersonalIdentifier(value = '') {
  if (!value) return false;

  const normalized = String(value).trim();
  if (!normalized) return false;

  if (/\S+@\S+\.\S+/.test(normalized)) return true;
  if (/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(normalized)) return true;
  if (/\b(?:prepared by|created by|author|owner)\b/i.test(normalized)) return true;

  return false;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

function sha256Hex(arrayBuffer) {
  return crypto.subtle.digest('SHA-256', arrayBuffer).then((digest) => {
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

function hasXmpMetadata(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const searchSize = Math.min(bytes.length, 65536);
  const view = bytes.subarray(0, searchSize);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(view);
  return /xmpmeta|xpacket/i.test(text);
}

function calculateRiskScore(metadata) {
  const checks = [];

  function push(field, value, risk, reason) {
    checks.push({ field, value: value ?? 'Not set', risk, reason });
  }

  // Author
  if (metadata.author) {
    const isPerson = /\S+@\S+\.\S+/.test(metadata.author) || /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(metadata.author);
    push('Author', metadata.author, isPerson ? 'High' : 'Medium', isPerson ? 'Contains personal name/email' : 'Contains organization or identifier');
  } else {
    push('Author', '', 'None', 'Not set');
  }

  // Creator
  if (metadata.creator) {
    push('Creator', metadata.creator, 'Low', 'Software used to create the document');
  } else {
    push('Creator', '', 'None', 'Not set');
  }

  // Subject
  if (metadata.subject) push('Subject', metadata.subject, 'Medium', 'May describe document contents');
  else push('Subject', '', 'None', 'Not set');

  // Keywords
  if (metadata.keywords) push('Keywords', Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : metadata.keywords, 'Medium', 'Tags could leak topics');
  else push('Keywords', '', 'None', 'Not set');

  // Dates
  if (metadata.creationDate) push('CreationDate', metadata.creationDate, 'Low', 'Document creation timestamp');
  else push('CreationDate', '', 'None', 'Not set');

  if (metadata.modificationDate) push('ModificationDate', metadata.modificationDate, 'Low', 'Last edit timestamp');
  else push('ModificationDate', '', 'None', 'Not set');

  // Page count
  push('PageCount', metadata.pageCount ?? 'Unknown', 'None', 'Number of pages');

  // File size
  push('FileSize', metadata.fileSize ?? 'Unknown', 'None', 'File size');

  // XMP
  push('XMP', metadata.hasXmpMetadata ? 'Present' : 'Not detected', metadata.hasXmpMetadata ? 'Medium' : 'None', metadata.hasXmpMetadata ? 'XMP metadata stream detected' : 'No XMP metadata detected');

  // Simple overall computation
  const highCount = checks.filter((c) => c.risk === 'High').length;
  const mediumCount = checks.filter((c) => c.risk === 'Medium').length;
  let overall = 'Low';
  if (highCount > 0) overall = 'High';
  else if (mediumCount > 0) overall = 'Medium';

  // Numeric score: 100 downweighted by risk counts (tunable)
  let score = 100 - highCount * 45 - mediumCount * 20;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return { checks, overall, score };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function clearPdfMetadata(pdfDoc) {
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setCreator('');
  pdfDoc.setProducer('');

  try {
    const metadataKey = PDFName.of('Metadata');
    const dict = pdfDoc.catalog?.dict;
    if (dict?.delete) {
      dict.delete(metadataKey);
    }
  } catch (e) {
    console.warn('Could not remove XMP metadata stream:', e);
  }
}

function setText(element, value) {
  if (!element) return;
  element.textContent = value;
  element.hidden = !value;
}

export function initPdfTool() {
  const dropzoneEl = document.querySelector('[data-pdf-dropzone]');
  const inputEl = document.querySelector('#pdf-file-input');
  const fileSummaryEl = document.querySelector('[data-file-summary]');
  const fingerprintEl = document.querySelector('[data-fingerprint]');
  const metadataContainer = document.querySelector('[data-metadata-table]');
  const errorEl = document.querySelector('[data-error]');
  const successEl = document.querySelector('[data-success]');
  const loadingEl = document.querySelector('[data-loading]');
  const stripButton = document.querySelector('[data-strip-button]');
  const downloadAgainButton = document.querySelector('[data-download-again]');
  const processHintEl = document.querySelector('[data-process-hint]');
  const stripSelectedBtn = document.querySelector('#strip-selected-btn');
  const stripAllBtn = document.querySelector('#strip-all-btn');
  const riskRowsEl = document.querySelector('#risk-rows');

  if (!dropzoneEl || !inputEl || !metadataContainer) return;

  // Entrance animation: add slide-in class then remove after it finishes
  try {
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dropzoneEl.classList.add('fileintel-input-panel--entrance');
      dropzoneEl.addEventListener('animationend', () => {
        dropzoneEl.classList.remove('fileintel-input-panel--entrance');
      }, { once: true });
    }
  } catch (err) {
    // silent fail — animation is non-critical
  }

  let currentFile = null;
  let currentBytes = null;
  let cleanBlob = null;
  let cleanFilename = '';

  const dropzone = createDropzone({
    dropzoneEl,
    inputEl,
    onFile: loadFile,
    onError: showError,
  });

  function clearMessages() {
    setText(errorEl, '');
    setText(successEl, '');
    if (loadingEl) loadingEl.hidden = true;
  }

  function showError(message) {
    setText(errorEl, message);
    setText(successEl, '');
    if (loadingEl) loadingEl.hidden = true;
    if (stripButton) stripButton.disabled = true;
    if (downloadAgainButton) downloadAgainButton.disabled = true;
  }

  function showSuccess(message) {
    setText(successEl, message);
    setText(errorEl, '');
  }

  function resetResults() {
    currentBytes = null;
    cleanBlob = null;
    cleanFilename = '';
    clearMetadataTable(metadataContainer);
    if (fileSummaryEl) fileSummaryEl.textContent = 'No file selected yet.';
    if (fingerprintEl) fingerprintEl.textContent = 'File fingerprint: [Not yet available]';
    if (downloadAgainButton) downloadAgainButton.disabled = true;
    if (stripButton) stripButton.disabled = true;
  }

  function updateFileSummary(file) {
    if (!fileSummaryEl) return;
    fileSummaryEl.textContent = `${file.name} • ${formatFileSize(file.size)}`;
  }

  async function loadFile(file) {
    clearMessages();
    resetResults();

    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showError('Please select a valid PDF file.');
      return;
    }

    currentFile = file;
    updateFileSummary(file);
    if (loadingEl) loadingEl.hidden = false;
    if (processHintEl) processHintEl.textContent = 'Reading file locally in your browser...';

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      currentBytes = arrayBuffer;
      const fingerprint = await sha256Hex(arrayBuffer);
      if (fingerprintEl) {
        fingerprintEl.textContent = `File fingerprint: ${fingerprint.slice(0, 16)}…`;
      }

      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
      } catch (error) {
        const message = String(error?.message || error || '').toLowerCase();
        if (message.includes('encrypted') || message.includes('password')) {
          showError('This PDF is password protected. We cannot process encrypted files.');
          return;
        }

        if (message.includes('invalid') || message.includes('damaged') || message.includes('corrupt')) {
          showError('This PDF appears to be damaged and cannot be processed.');
          return;
        }

        showError('This PDF appears to be damaged and cannot be processed.');
        return;
      }

      const author = pdfDoc.getAuthor() || '';
      const creator = pdfDoc.getCreator() || '';

      const metadata = {
        title: pdfDoc.getTitle(),
        author: author || null,
        subject: pdfDoc.getSubject(),
        keywords: pdfDoc.getKeywords(),
        creator: creator || null,
        producer: pdfDoc.getProducer(),
        creationDate: pdfDoc.getCreationDate(),
        modificationDate: pdfDoc.getModificationDate(),
        pageCount: pdfDoc.getPageCount(),
        fileSize: formatFileSize(file.size),
        hasXmpMetadata: hasXmpMetadata(arrayBuffer),
      };

      const riskReport = calculateRiskScore({
        title: metadata.title,
        author: metadata.author,
        subject: metadata.subject,
        keywords: metadata.keywords,
        creator: metadata.creator,
        producer: metadata.producer,
        creationDate: metadata.creationDate,
        modificationDate: metadata.modificationDate,
        pageCount: metadata.pageCount,
        fileSize: metadata.fileSize,
        hasXmpMetadata: metadata.hasXmpMetadata,
      });

      renderMetadataTable(metadataContainer, metadata, riskReport, {
        showWarning: isLikelyPersonalIdentifier(author) || isLikelyPersonalIdentifier(creator),
      });

      if (riskRowsEl) renderRiskRows(riskRowsEl, metadata, riskReport);

      // Wire summary elements with quick snapshot
      if (fileSummaryEl) {
        const overall = riskReport?.overall || 'Low';
        const emoji = overall === 'High' ? '🔴' : overall === 'Medium' ? '🟡' : '🟢';
        fileSummaryEl.textContent = `${file.name} • ${formatFileSize(file.size)} • Privacy: ${emoji} ${overall}`;
      }

      if (stripButton) stripButton.disabled = false;
      if (downloadAgainButton) downloadAgainButton.disabled = true;
      if (loadingEl) loadingEl.hidden = true;
      if (processHintEl) processHintEl.textContent = 'Inspection completed entirely in your browser.';
    } catch (error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('encrypted') || message.includes('password')) {
        showError('This PDF is password protected. We cannot process encrypted files.');
        return;
      }

      showError('Something went wrong. Please try a different file.');
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderRiskRows(container, metadata, riskReport) {
    const checks = (riskReport && riskReport.checks) || [];
    const rows = checks.map((c) => ({ field: c.field, value: c.value, risk: c.risk, reason: c.reason }));

    if (!container) return;

    container.innerHTML = `
      <div style="margin:0 20px 20px;border:1px solid var(--paper-3);border-radius:var(--radius);overflow:hidden;">
        <table class="meta-table" style="width:100%;">
          <thead>
            <tr>
              <th>Strip</th>
              <th>Field</th>
              <th>Value</th>
              <th style="text-align:center;">Risk</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((r) => {
                const val = r.value instanceof Date ? formatDate(r.value) : String(r.value ?? '');
                const valClass = r.risk === 'High' ? 'risk-high' : r.risk === 'Medium' ? 'risk-med' : '';
                const dotClass = r.risk === 'High' ? 'high' : r.risk === 'Medium' ? 'medium' : 'low';
                return `
                  <tr>
                    <td style="text-align:center;">
                      <input type="checkbox" data-field="${escapeHtml(r.field)}" aria-label="Strip ${escapeHtml(r.field)}" style="width:16px;height:16px;accent-color:var(--accent);" />
                    </td>
                    <td class="meta-key">${escapeHtml(r.field)}</td>
                    <td class="meta-val ${valClass}">${escapeHtml(val)}</td>
                    <td><div class="risk-dot ${dotClass}" style="margin:0 auto;"></div></td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function handleStripSelected() {
    if (!currentFile || !currentBytes) return;

    const checked = Array.from((riskRowsEl || document).querySelectorAll('input[type="checkbox"][data-field]:checked')).map((el) => el.getAttribute('data-field'));
    if (!checked.length) {
      showError('No fields selected to strip.');
      return;
    }

    clearMessages();
    if (loadingEl) loadingEl.hidden = false;
    if (processHintEl) processHintEl.textContent = 'Stripping selected metadata locally...';

    try {
      const loadedDoc = await PDFDocument.load(currentBytes, { ignoreEncryption: false });
      if (checked.includes('Author')) loadedDoc.setAuthor('');
      if (checked.includes('Title')) loadedDoc.setTitle('');
      if (checked.includes('Subject')) loadedDoc.setSubject('');
      if (checked.includes('Keywords')) loadedDoc.setKeywords([]);
      if (checked.includes('Creator')) loadedDoc.setCreator('');
      if (checked.includes('Producer')) loadedDoc.setProducer('');

      let cleanedBytes = await loadedDoc.save();
      try {
        await PDFDocument.load(cleanedBytes);
      } catch (validateErr) {
        console.error('Validation failed, trying fallback:', validateErr);
        cleanedBytes = await loadedDoc.save({ useObjectStreams: false });
        await PDFDocument.load(cleanedBytes);
      }

      const blob = new Blob([cleanedBytes], { type: 'application/pdf' });
      downloadBlob(blob, currentFile.name.replace(/\.pdf$/i, '') + '-cleaned-selected.pdf');
      showSuccess('Selected metadata removed and file downloaded.');
      if (downloadAgainButton) downloadAgainButton.disabled = false;
      if (loadingEl) loadingEl.hidden = true;
      if (processHintEl) processHintEl.textContent = 'You can download the cleaned PDF again below.';
    } catch (err) {
      console.error('Error stripping selected fields', err);
      showError('Something went wrong while stripping selected fields.');
    }
  }

  async function handleStripClick() {
    if (!currentFile || !currentBytes) return;

    clearMessages();
    if (loadingEl) loadingEl.hidden = false;
    if (processHintEl) processHintEl.textContent = 'Stripping metadata locally...';

    try {
      const loadedDoc = await PDFDocument.load(currentBytes, { ignoreEncryption: false });
      clearPdfMetadata(loadedDoc);

      let cleanedBytes = await loadedDoc.save();

      try {
        await PDFDocument.load(cleanedBytes);
      } catch (validateErr) {
        console.error('Cleaned PDF validation failed, attempting fallback save', validateErr);
        cleanedBytes = await loadedDoc.save({ useObjectStreams: false });
        await PDFDocument.load(cleanedBytes);
      }

      cleanBlob = new Blob([cleanedBytes], { type: 'application/pdf' });
      cleanFilename = currentFile.name.replace(/\.pdf$/i, '') + '-cleaned.pdf';

      downloadBlob(cleanBlob, cleanFilename);
      showSuccess('Metadata removed successfully. Your cleaned PDF has been downloaded.');
      if (downloadAgainButton) downloadAgainButton.disabled = false;
      if (loadingEl) loadingEl.hidden = true;
      if (processHintEl) processHintEl.textContent = 'You can download the cleaned PDF again below.';
    } catch (error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('encrypted') || message.includes('password')) {
        showError('This PDF is password protected. We cannot process encrypted files.');
        return;
      }

      if (message.includes('invalid') || message.includes('damaged') || message.includes('corrupt')) {
        showError('This PDF appears to be damaged and cannot be processed.');
        return;
      }

      showError('Something went wrong. Please try a different file.');
    }
  }

  function handleDownloadAgain() {
    if (!cleanBlob || !cleanFilename) return;
    downloadBlob(cleanBlob, cleanFilename);
  }

  stripButton?.addEventListener('click', handleStripClick);
  downloadAgainButton?.addEventListener('click', handleDownloadAgain);
  stripSelectedBtn?.addEventListener('click', handleStripSelected);
  stripAllBtn?.addEventListener('click', handleStripClick);

  resetResults();
  clearMessages();

  return {
    destroy() {
      dropzone?.reset();
    },
  };
}