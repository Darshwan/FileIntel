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

export function renderMetadataTable(container, metadata) {
  if (!container) return;

  const rows = [
    ['Title', metadata.title],
    ['Author', metadata.author],
    ['Subject', metadata.subject],
    ['Keywords', metadata.keywords],
    ['Creator', metadata.creator],
    ['Producer', metadata.producer],
    ['Creation Date', metadata.creationDate],
    ['Modification Date', metadata.modificationDate],
    ['Page Count', metadata.pageCount],
    ['File Size', metadata.fileSize],
    ['XMP Metadata Present', metadata.hasXmpMetadata],
  ];

  const warningRow = metadata.showWarning
    ? `
      <tr class="border-t border-[rgba(156,120,70,0.18)] bg-[rgba(156,120,70,0.08)]">
        <th scope="row" class="px-4 py-3 text-left font-medium text-fileintel-ink">Metadata warning</th>
        <td class="px-4 py-3 text-fileintel-gold">This document may contain identifying information.</td>
      </tr>
    `
    : '';

  container.innerHTML = `
    <div class="overflow-hidden rounded-[28px] border border-fileintel-line bg-white/80 shadow-premium backdrop-blur-xl">
      <div class="border-b border-fileintel-line px-5 py-4 sm:px-6">
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-fileintel-muted">Metadata inspection</p>
        <p class="mt-2 text-sm text-fileintel-ink/70">Review the document details that can travel with your file.</p>
      </div>
      <table class="min-w-full divide-y divide-fileintel-line text-sm">
        <tbody class="divide-y divide-fileintel-line/70">
          ${rows
            .map(
              ([label, value]) => `
                <tr class="odd:bg-white even:bg-[#fbf8f2]">
                  <th scope="row" class="w-56 bg-transparent px-4 py-3 text-left font-medium text-fileintel-ink">${escapeHtml(label)}</th>
                  <td class="px-4 py-3 text-fileintel-ink/76">${renderValue(value)}</td>
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