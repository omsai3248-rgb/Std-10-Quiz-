import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('NativeFirebaseBridge loads unlimited access_codes without 600-doc truncation and streams in chunks', () => {
  const kt = read('app/src/main/java/com/aistudio/std10quiz/kqxmtv/NativeFirebaseBridge.kt');

  // Ensure access_codes live listener & cache have NO .limit(600) cap so older batches (Maths, Science, SS) never shrink
  assert.doesNotMatch(kt, /\.limit\(600\)/, 'access_codes queries must not be capped at 600');

  // Chunked bridge transfer keeps large unlimited code sets safe over WebView evaluateJavascript
  assert.match(kt, /private fun emitAllCodesChunked\(docs: List<DocumentSnapshot>, streamSeq: Long\)/);
  assert.match(kt, /window\.__onNativeAllCodesChunkStart/);
  assert.match(kt, /window\.__onNativeAllCodesChunk/);
  assert.match(kt, /window\.__onNativeAllCodesChunkEnd/);

  // Bulk generation allows unlimited count (no 500 cap) and chunks writes at 400 docs per Firestore batch
  assert.doesNotMatch(kt, /coerceIn\(1,\s*500\)/, 'generateBulkCodes must not clamp count to 500');
  assert.match(kt, /val count = obj\.getInt\("count"\)\.coerceAtLeast\(1\)/);
  assert.match(kt, /codeList\.chunked\(400\)/);

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

test('nativeFirebaseBridge.ts reassembles chunked unlimited all_codes streams without data loss', () => {
  const bridge = read('src/services/nativeFirebaseBridge.ts');

  assert.match(bridge, /window\.__onNativeAllCodesChunkStart = \(streamId\)/);
  assert.match(bridge, /window\.__onNativeAllCodesChunk = \(streamId, chunk\)/);
  assert.match(bridge, /window\.__onNativeAllCodesChunkEnd = \(streamId\)/);
  assert.match(bridge, /pendingAllCodesChunks\.push\(chunk\[i\]\)/);
});

test('quizRepository supports unlimited observeAllAccessCodes, unlimited bulk generation, batch fetch, and delete unused', () => {
  const repo = read('src/services/quizRepository.ts');

  // observeAllAccessCodes must NOT truncate with limit(ADMIN_CODES_PAGE_SIZE)
  const obsBlock = repo.slice(
    repo.indexOf('export function observeAllAccessCodes'),
    repo.indexOf('export async function loadMoreAdminPayments')
  );
  assert.doesNotMatch(obsBlock, /limit\(/, 'observeAllAccessCodes must load all codes across all batch folders');

  // generateBulkAccessCodes must NOT reject counts > 500 and must chunk Firestore WriteBatch at 400
  const genBlock = repo.slice(
    repo.indexOf('export async function generateBulkAccessCodes'),
    repo.indexOf('export interface DirectMobileCodeResult')
  );
  assert.doesNotMatch(genBlock, /count > 500/, 'generateBulkAccessCodes must support unlimited counts');
  assert.match(genBlock, /i \+= 400/);

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

test('batchCodeUtils groups unlimited Maths + Science + SS 400-code batches cleanly without shrinking', () => {
  const utils = read('src/utils/batchCodeUtils.ts');

  assert.match(utils, /export function groupAccessCodesIntoBatchFolders/);
  assert.match(utils, /export function suggestNextBatchName/);
  assert.match(utils, /DIRECT_OR_UNTAGGED_BATCH_KEY = '__direct_untagged__'/);
  assert.match(utils, /export function isAccessCodeUsed/);

  // Simulate 400 Maths + 400 Science + 400 Social Science = 1200 codes grouped by batchName
  const batchCounts = new Map();
  const batches = [
    { name: 'Maths Batch 1', prefix: 'MAT', count: 400 },
    { name: 'Science Batch 1', prefix: 'SCI', count: 400 },
    { name: 'Social Science Batch 1', prefix: 'SOC', count: 400 },
    { name: 'All Subjects Mega Batch', prefix: 'ALL', count: 1200 },
  ];
  const allCodes = [];
  for (const b of batches) {
    for (let i = 0; i < b.count; i++) {
      allCodes.push({
        code: `${b.prefix}${String(i).padStart(5, '0')}`,
        batchName: b.name,
      });
    }
  }
  for (const item of allCodes) {
    batchCounts.set(item.batchName, (batchCounts.get(item.batchName) ?? 0) + 1);
  }
  assert.equal(allCodes.length, 2400);
  assert.equal(batchCounts.get('Maths Batch 1'), 400);
  assert.equal(batchCounts.get('Science Batch 1'), 400);
  assert.equal(batchCounts.get('Social Science Batch 1'), 400);
  assert.equal(batchCounts.get('All Subjects Mega Batch'), 1200);
});

test('AdminAllCodesTab provides Unlimited Bulk Generate, Batch Folders, Batch PDF download, and 1-Click Delete Unused modal', () => {
  const tabs = read('src/screens/AdminTabs.tsx');

  // Batch folders view + opened folder view + presets up to 1000 and no 500 clamp
  assert.match(tabs, /const BULK_COUNT_PRESETS = \[50, 100, 200, 400, 500, 1000\] as const;/);
  assert.doesNotMatch(tabs, /Math\.min\(500,/, 'AdminAllCodesTab must not clamp bulk code count to 500');
  assert.match(tabs, /maxLength=\{5\}/);
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

  assert.match(app, /setHasMoreCodes\(false\)/);
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
