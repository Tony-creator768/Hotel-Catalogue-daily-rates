/**
 * GU-Q Daily Hotel Room Rates Catalogue API
 * One-sheet version. Uses only the Catalogue_View sheet.
 *
 * Google Sheets setup:
 * 1. Import daily_rates_monthly_style_one_sheet_catalogue.xlsx into Google Sheets.
 * 2. Keep the sheet tab name exactly: Catalogue_View.
 * 3. Extensions > Apps Script.
 * 4. Paste this file.
 * 5. Deploy > New deployment > Web app.
 * 6. Execute as: Me.
 * 7. Access: Anyone with the link OR your organization only.
 * 8. Copy the /exec URL into website/config.js.
 */

const SHEET_NAME = 'Catalogue_View';
const APPROVED_ONLY_DEFAULT = true;
const CACHE_SECONDS = 300;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const includeAll = String(params.all || '').toLowerCase() === 'true';
  const refresh = String(params.refresh || '').toLowerCase() === 'true';
  const callback = params.callback;

  const approvedOnly = !includeAll && APPROVED_ONLY_DEFAULT;
  const cacheKey = approvedOnly ? 'daily_catalogue_approved' : 'daily_catalogue_all';
  const cache = CacheService.getScriptCache();

  if (!refresh) {
    const cached = cache.get(cacheKey);
    if (cached) return output_(cached, callback);
  }

  const payload = getCataloguePayload_(approvedOnly);
  const json = JSON.stringify(payload);

  try {
    cache.put(cacheKey, json, CACHE_SECONDS);
  } catch (err) {
    console.log('Cache skipped: ' + err);
  }

  return output_(json, callback);
}

function output_(json, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getCataloguePayload_(approvedOnly) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    return {
      ok: false,
      error: `Sheet '${SHEET_NAME}' was not found.`,
      updatedAt: new Date().toISOString(),
      count: 0,
      rows: []
    };
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      ok: true,
      source: ss.getName(),
      sheet: SHEET_NAME,
      updatedAt: new Date().toISOString(),
      count: 0,
      rows: []
    };
  }

  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i];
    const row = {};

    headers.forEach((header, index) => {
      row[header] = cleanValue_(rowValues[index]);
    });

    const hasProperty = String(row['Property Name'] || '').trim() !== '';
    const hasRoom = String(row['Room Type'] || row['Unit Type'] || '').trim() !== '';

    if (!hasProperty && !hasRoom) continue;

    const status = String(row['Approval Status'] || '').trim().toLowerCase();
    if (approvedOnly && status !== 'approved') continue;

    // Safety: this daily catalogue intentionally excludes long-stay rows.
    const stayType = String(row['Stay Type'] || '').trim().toLowerCase();
    if (stayType.includes('long')) continue;

    rows.push(row);
  }

  return {
    ok: true,
    source: ss.getName(),
    sheet: SHEET_NAME,
    updatedAt: new Date().toISOString(),
    count: rows.length,
    rows
  };
}

function cleanValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (typeof value === 'number') return value;

  if (value === null || value === undefined) return '';

  return String(value).trim();
}

function clearCatalogueCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('daily_catalogue_approved');
  cache.remove('daily_catalogue_all');
  Logger.log('Daily catalogue cache cleared.');
}

function testCatalogueAPI() {
  const data = getCataloguePayload_(true);
  Logger.log(JSON.stringify(data, null, 2));
}
