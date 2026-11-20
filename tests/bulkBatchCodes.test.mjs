import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('NativeFirebaseBridge supports 600+ code fetch, fetchCodesByBatch, and safe deleteUnusedAccessCodes', () => {
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/NativeFirebaseBridge.kt');

  // Ensure access_codes queries load up to 600 codes so 400-code bulk batches appear immediately
  const limit600Matches = kt.match(/\.limit\(600\)/g) || [];
  assert.ok(limit600Matches.length >= 2, 'Expected at least 2 .limit(600) calls for access_codes');

  // fetchCodesByBatch queries Firestore by batchName (single-field index, zero composite index needed)
  assert.match(kt, /fun fetchCodesByBatch\(callId: String, payloadJson: String\)/);
  assert.match(kt, /\.whereEqualTo\("batchName", batchName\)/);

  // deleteUnusedAccessCodes only deletes unused codes and chunks batches at 400
  assert.match(kt, /fun deleteUnusedAccessCodes\(callId: String, payloadJson: String\)/);
  assert.match(kt, /!isUsed && status != "used"/);
  assert.match(kt, /unusedDocs\.chunked\(400\)/);
  assert.match(kt, /put\("deletedCount", unusedDocs\.size\)/);
  assert.match(kt, /put\("deletedCodes", deletedCodesArr\)/);
});

test('quizRepository exposes ADMIN_CODES_PAGE_SIZE=600, fetchAccessCodesByBatchAdmin, and deleteUnusedAccessCodesAdmin', () => {
  const repo = read('src/services/quizRepository.ts');

  assert.match(repo, /export const ADMIN_CODES_PAGE_SIZE = 600;/);
  assert.match(repo, /limit\(ADMIN_CODES_PAGE_SIZE\)/);
  assert.match(repo, /export async function fetchAccessCodesByBatchAdmin\(batchName: string\)/);
  assert.match(repo, /export async function deleteUnusedAccessCodesAdmin\(/);
  assert.match(repo, /window\.AndroidFirebaseBridge\?\.fetchCodesByBatch\?\./);
  assert.match(repo, /window\.AndroidFirebaseBridge\?\.deleteUnusedAccessCodes\?\./);
  assert.match(repo, /!isUsed && status !== 'used'/);
  assert.match(repo, /i \+= 400/);
});

test('pdfGenerator exports A4 PDF with batch header and Android WebView AndroidBridge support', () => {
  const pdf = read('src/services/pdfGenerator.ts');

  assert.match(pdf, /export function exportAccessCodesA4Pdf/);
  assert.match(pdf, /Quick Quiz - \$\{cleanHeaderTitle\}/);
  assert.match(pdf, /Total: \$\{codes\.length\} Codes/);
  assert.match(pdf, /window\.AndroidBridge\?\.saveExportedFile/);
  assert.match(pdf, /doc\.output\('datauristring'\)/);
  assert.match(pdf, /doc\.save\(fileName\)/);
});

test('batchCodeUtils groups 400 bulk codes into named Batch folders and suggests next batch name', () => {
  const utils = read('src/utils/batchCodeUtils.ts');

  assert.match(utils, /export function groupAccessCodesIntoBatchFolders/);
  assert.match(utils, /export function suggestNextBatchName/);
  assert.match(utils, /DIRECT_OR_UNTAGGED_BATCH_KEY = '__direct_untagged__'/);
  assert.match(utils, /export function isAccessCodeUsed/);
});

test('AdminAllCodesTab provides Batch Folders, Batch PDF download, and 1-Click Delete Unused modal', () => {
  const tabs = read('src/screens/AdminTabs.tsx');

  // Batch folders view + opened folder view + quick 400 preset
  assert.match(tabs, /const BULK_COUNT_PRESETS = \[50, 100, 200, 400, 500\] as const;/);
  assert.match(tabs, /data-testid="batch_folders_grid"/);
  assert.match(tabs, /data-testid="opened_batch_folder_header"/);
  assert.match(tabs, /data-testid="just_created_batch_banner"/);

  // Batch PDF download buttons (on folder card & inside opened folder)
  assert.match(tabs, /data-testid=\{`batch_pdf_btn_\$\{folder\.folderKey\}`\}/);
  assert.match(tabs, /data-testid="opened_folder_pdf_all_btn"/);

  // 1-Click Delete Unused Codes buttons (global, per-folder card, inside opened folder) + confirmation modal
  assert.match(tabs, /data-testid="delete_all_unused_codes_btn"/);
  assert.match(tabs, /data-testid=\{`batch_delete_unused_btn_\$\{folder\.folderKey\}`\}/);
  assert.match(tabs, /data-testid="opened_folder_delete_unused_btn"/);
  assert.match(tabs, /data-testid="confirm_delete_unused_modal"/);
  assert.match(tabs, /data-testid="confirm_delete_unused_submit_btn"/);
});

test('App.tsx wires bulk batch return, batch fetch, and 1-click delete unused handlers', () => {
  const app = read('src/App.tsx');

  assert.match(app, /ADMIN_CODES_PAGE_SIZE/);
  assert.match(app, /deleteUnusedAccessCodesAdmin/);
  assert.match(app, /fetchAccessCodesByBatchAdmin/);
  assert.match(app, /onDeleteUnusedCodes=\{handleDeleteUnusedCodes\}/);
  assert.match(app, /onFetchBatchCodes=\{handleFetchBatchCodes\}/);
});

test('Subject-prefixed 8-char codes use MAT/SCI/SOC/ALL + 5 random chars in both Web and Android Kotlin', () => {
  const models = read('src/types/models.ts');
  const repo = read('src/services/quizRepository.ts');
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/NativeFirebaseBridge.kt');

  // models.ts prefixes & resolver
  assert.match(models, /case 'maths':\s*return 'MAT';/);
  assert.match(models, /case 'science':\s*return 'SCI';/);
  assert.match(models, /case 'social_science':\s*return 'SOC';/);
  assert.match(models, /default:\s*return 'ALL';/);
  assert.match(models, /upperCode\.startsWith\('MAT'\)/);
  assert.match(models, /upperCode\.startsWith\('ALL'\)/);

  // quizRepository.ts generates 3-char prefix + 5 random chars everywhere
  assert.match(repo, /export function generateUnique8CharCode\(subjectId = 'all'\): string/);
  assert.match(repo, /const prefix = getDefaultPrefix\(subjectId\);/);
  assert.match(repo, /new Uint32Array\(5\)/);
  const tsCalls = repo.match(/generateUnique8CharCode\(normalizedSubject\)/g) || [];
  assert.equal(tsCalls.length, 3, 'Expected all 3 TypeScript code generators to pass normalizedSubject');

  // NativeFirebaseBridge.kt generates 3-char prefix + 5 random chars everywhere
  assert.match(kt, /"maths" -> "MAT"/);
  assert.match(kt, /"science" -> "SCI"/);
  assert.match(kt, /"social_science" -> "SOC"/);
  assert.match(kt, /else -> "ALL"/);
  assert.match(kt, /append\(getSubjectCodePrefix\(subjectId\)\)/);
  assert.match(kt, /repeat\(5\)/);
  const ktCalls = kt.match(/generate8CharCode\(subjectId\)/g) || [];
  assert.equal(ktCalls.length, 3, 'Expected all 3 Kotlin code generators to pass subjectId');
});
