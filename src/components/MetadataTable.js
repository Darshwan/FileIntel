function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderValue(value) {
  if (Array.isArray(value)) {
    return escapeHtml(value.join(', '));
  }

  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined || value === '') return 'Not set';

  return escapeHtml(value);
}

export function renderMetadataTable(container, metadata, riskReport, options = {}) {
  if (!container) return;

  const overall = (riskReport && riskReport.overall) || 'Low';

  function badge(risk) {
    const label = escapeHtml(risk);
    const colorClass = risk === 'High' ? 'bg-red-100 text-red-700' : risk === 'Medium' ? 'bg-yellow-100 text-yellow-700' : risk === 'Low' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
    return `<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${colorClass}">${label}</span>`;
  }

  const rows = [
    ['Title', metadata.title, (riskReport && findRisk('Title'))],
    ['Author', metadata.author, (riskReport && findRisk('Author'))],
    ['Subject', metadata.subject, (riskReport && findRisk('Subject'))],
    ['Keywords', metadata.keywords, (riskReport && findRisk('Keywords'))],
    ['Creator', metadata.creator, (riskReport && findRisk('Creator'))],
    ['Producer', metadata.producer, null],
    ['Creation Date', metadata.creationDate ? formatDateForRender(metadata.creationDate) : metadata.creationDate, (riskReport && findRisk('CreationDate'))],
    ['Modification Date', metadata.modificationDate ? formatDateForRender(metadata.modificationDate) : metadata.modificationDate, (riskReport && findRisk('ModificationDate'))],
    ['Page Count', metadata.pageCount, (riskReport && findRisk('PageCount'))],
    ['File Size', metadata.fileSize, (riskReport && findRisk('FileSize'))],
    ['XMP Metadata Present', metadata.hasXmpMetadata ? 'Yes' : 'No', (riskReport && findRisk('XMP'))],
  ];

  function formatDateForRender(value) {
    try {
      if (value instanceof Date) return value.toLocaleString();
      return String(value);
    } catch (e) {
      return String(value);
    }
  }

  function findRisk(field) {
    if (!riskReport || !Array.isArray(riskReport.checks)) return null;
    return riskReport.checks.find((c) => c.field === field) || null;
  }

  const warningRow = options.showWarning
    ? `
      <tr class="border-t border-[rgba(156,120,70,0.18)] bg-[rgba(156,120,70,0.08)]">
        <th scope="row" class="px-4 py-3 text-left font-medium text-fileintel-ink">Metadata warning</th>
        <td class="px-4 py-3 text-fileintel-gold">This document may contain identifying information.</td>
      </tr>
    `
    : '';

  const riskSummary = riskReport
    ? (() => {
        const score = Math.max(0, Math.min(100, Number(riskReport.score || 0)));
        const circR = 36;
        const circ = 2 * Math.PI * circR;
        const offset = Math.round(circ * (1 - score / 100));
        return `
      <div class="px-5 py-4 sm:px-6 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <svg width="92" height="92" viewBox="0 0 92 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="g1" x1="0%" x2="100%">
                <stop offset="0%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#047857" />
              </linearGradient>
            </defs>
            <g transform="translate(46,46)">
              <circle r="${circR}" fill="none" stroke="#eee" stroke-width="8" />
              <circle r="${circR}" fill="none" stroke="url(#g1)" stroke-width="8" stroke-linecap="round" transform="rotate(-90)" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" />
              <text x="0" y="6" font-size="20" font-weight="700" text-anchor="middle" fill="#0f172a">${score}</text>
            </g>
          </svg>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-fileintel-muted">Privacy Risk</p>
            <p class="mt-2 text-lg font-semibold text-fileintel-ink/90">${escapeHtml(overall)} Risk</p>
            <p class="mt-1 text-sm text-fileintel-ink/70">High: ${riskReport.checks.filter(c=>c.risk==='High').length} • Medium: ${riskReport.checks.filter(c=>c.risk==='Medium').length}</p>
          </div>
        </div>
      </div>
    `;
      })()
    : '';

  container.innerHTML = `
    <div class="overflow-hidden rounded-[28px] border border-fileintel-line bg-white/80 shadow-premium backdrop-blur-xl">
      ${riskSummary}
      <div class="border-b border-fileintel-line px-5 py-2 sm:px-6">
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-fileintel-muted">Metadata inspection</p>
        <p class="mt-2 text-sm text-fileintel-ink/70">Review the document details that can travel with your file.</p>
      </div>
      <table class="min-w-full divide-y divide-fileintel-line text-sm">
        <thead class="sr-only">
          <tr><th>Field</th><th>Value</th><th>Risk</th></tr>
        </thead>
        <tbody class="divide-y divide-fileintel-line/70">
          ${rows
            .map(
              ([label, value, riskObj]) => `
                <tr class="odd:bg-white even:bg-[#fbf8f2]">
                  <th scope="row" class="w-56 bg-transparent px-4 py-3 text-left font-medium text-fileintel-ink">${escapeHtml(label)}</th>
                  <td class="px-4 py-3 text-fileintel-ink/76">${renderValue(value)}</td>
                  <td class="px-4 py-3">${riskObj ? badge(riskObj.risk) + '<div class="text-xs text-fileintel-muted mt-1">' + escapeHtml(riskObj.reason) + '</div>' : ''}</td>
                </tr>
              `,
            )
            .join('')}
          ${warningRow}
        </tbody>
      </table>
    </div>
  `;
}

export function clearMetadataTable(container) {
  if (container) {
    container.innerHTML = '';
  }
}