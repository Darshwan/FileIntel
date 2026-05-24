import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { clearPdfMetadata } from '../src/components/PdfTool.js';

test('strip flow produces a valid PDF with cleared core metadata', async () => {
  const inputDoc = await PDFDocument.create();
  inputDoc.addPage([300, 300]);
  inputDoc.setTitle('Confidential Draft');
  inputDoc.setAuthor('Sarah J. Mitchell');
  inputDoc.setSubject('Internal review');
  inputDoc.setCreator('Word 16.72');

  const inputBytes = await inputDoc.save();
  const loadedDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: false });

  clearPdfMetadata(loadedDoc);

  const cleanedBytes = await loadedDoc.save();
  const cleanedDoc = await PDFDocument.load(cleanedBytes, { ignoreEncryption: false });

  assert.equal(cleanedDoc.getAuthor(), '');
  assert.equal(cleanedDoc.getTitle(), '');
  assert.equal(cleanedDoc.getPageCount(), 1);
});
