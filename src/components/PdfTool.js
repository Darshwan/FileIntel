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
  const text = new TextDecoder('latin1').decode(arrayBuffer);
  return /<x:xmpmeta|\?xpacket begin=/i.test(text);
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function stripPdfMetadataFromDoc(pdfDoc) {
  const targetDoc = await PDFDocument.create();
  const pages = await targetDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
  pages.forEach((page) => targetDoc.addPage(page));

  targetDoc.catalog?.dict?.delete?.(PDFName.of('Metadata'));
  return targetDoc;
}

function setText(element, value) {
  if (element) element.textContent = value;
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

      renderMetadataTable(metadataContainer, {
        title: pdfDoc.getTitle(),
        author: author || null,
        subject: pdfDoc.getSubject(),
        keywords: pdfDoc.getKeywords(),
        creator: creator || null,
        producer: pdfDoc.getProducer(),
        creationDate: formatDate(pdfDoc.getCreationDate()),
        modificationDate: formatDate(pdfDoc.getModificationDate()),
        pageCount: pdfDoc.getPageCount(),
        fileSize: formatFileSize(file.size),
        hasXmpMetadata: hasXmpMetadata(arrayBuffer),
        showWarning: isLikelyPersonalIdentifier(author) || isLikelyPersonalIdentifier(creator),
      });

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

  async function handleStripClick() {
    if (!currentFile || !currentBytes) return;

    clearMessages();
    if (loadingEl) loadingEl.hidden = false;
    if (processHintEl) processHintEl.textContent = 'Stripping metadata locally...';

    try {
      const loadedDoc = await PDFDocument.load(currentBytes, { ignoreEncryption: false });
      const cleanDoc = await stripPdfMetadataFromDoc(loadedDoc);

      cleanDoc.setAuthor('');
      cleanDoc.setTitle('');
      cleanDoc.setSubject('');
      cleanDoc.setKeywords([]);
      cleanDoc.setProducer('');
      cleanDoc.setCreator('');
      cleanDoc.catalog?.dict?.delete?.(PDFName.of('Metadata'));

      const cleanedBytes = await cleanDoc.save({ useObjectStreams: false });
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

  resetResults();
  clearMessages();

  return {
    destroy() {
      dropzone?.reset();
    },
  };
}