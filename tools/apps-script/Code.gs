/**
 * MOD MAP web prototype: receives test-run data and saves it in the lead's Google Drive.
 *
 * Each run becomes one JSON file in the Drive folder "MOD MAP web tests", and one summary row goes to the spreadsheet
 * "MOD MAP web tests (summary)" in the same folder. Only data shaped like a MOD MAP web test is accepted, and a run that
 * arrives twice is saved once. Deploy steps: README.md next to this file.
 */
const FOLDER_NAME = 'MOD MAP web tests';
const SHEET_NAME = 'MOD MAP web tests (summary)';
const MAX_CHARS = 15 * 1024 * 1024;
const HEAD = ['received', 'run start', 'tester', 'kind', 'scenario', 'mode', 'outcome', 'duration s', 'os', 'browser', 'motion Hz',
  'gyroscope', 'motion permission', 'height cm', 'step len (calibration walk)', 'arrival error m', 'segment route m', 'segment steps',
  'step len used', 'step len source', 'step len from route', 'calibration steps', 'calibration step len', 'OCR attempts',
  'OCR confirmed right', 'taps', 'motion samples', 'app version', 'file'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = (e && e.postData && e.postData.contents) || '';
    if (!body || body.length > MAX_CHARS) return out_({ ok: false, error: 'empty or too large' });
    const d = JSON.parse(body);
    if (d.schema !== 'modmap-web-test/1' || d.platform !== 'web' || !d.run || !d.run.id || !d.session) {
      return out_({ ok: false, error: 'not a MOD MAP web test' });
    }
    lock.waitLock(20000);
    const folder = folder_();
    const name = [String(d.run.started_at || '').slice(0, 10), clean_(d.session.tester), clean_(d.run.kind), clean_(d.run.id)].join('_') + '.json';
    if (folder.getFilesByName(name).hasNext()) return out_({ ok: true, duplicate: true });
    folder.createFile(name, body, 'application/json');
    sheet_().appendRow(row_(d, name));
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* not held */ }
  }
}

function doGet() {
  return out_({ ok: true, service: 'modmap-web-test', time: new Date().toISOString() });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || 'x';
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (ignore) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
    ss.getSheets()[0].appendRow(HEAD);
    try { DriveApp.getFileById(ss.getId()).moveTo(folder_()); } catch (ignore) { /* stays in My Drive */ }
  }
  return ss.getSheets()[0];
}

function row_(d, name) {
  const r = d.run || {}, s = d.session || {}, c = s.census || {}, m = r.summary || {}, ev = r.events || [];
  const count = (f) => ev.filter(f).length;
  return [new Date(), r.started_at, s.tester, r.kind, r.scenario || '', r.mode, r.outcome, r.duration_s,
    c.os, c.browser, c.rate_hz, c.has_gyro, c.permission, s.height_cm, s.step_len_profile ? s.step_len_profile.L : '',
    m.arrival_err_m, m.seg_route_m, m.seg_steps, m.step_len_used, m.step_len_source, m.step_len_from_route,
    r.kind === 'calibration' ? m.steps : '', r.kind === 'calibration' ? m.step_len : '',
    count((x) => x.type === 'ocr'), count((x) => x.type === 'ocr_confirm' && x.ok), r.taps, d.motion ? d.motion.n : 0,
    d.app ? d.app.version : '', name];
}
