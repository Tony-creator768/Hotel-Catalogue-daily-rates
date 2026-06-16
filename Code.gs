/**
 * GU-Q Daily Hotel Room Rates Catalogue API
 * Traceable one-sheet version. Reads only Catalogue_View.
 *
 * Setup:
 * 1. Import daily_rates_sheet_catalogue_with_latest_contracts.xlsx into Google Sheets.
 * 2. Keep the tab name exactly: Catalogue_View.
 * 3. Extensions > Apps Script.
 * 4. Paste this file as Code.gs.
 * 5. Deploy > New deployment > Web app.
 * 6. Execute as: Me.
 * 7. Access: Georgetown organization only, unless the website must be public.
 * 8. Copy the /exec URL into website/config.js as DATA_URL.
 */

const SHEET_NAME = 'Catalogue_View';
const APPROVED_ONLY_DEFAULT = true;
const EXCLUDE_LONG_STAY_DEFAULT = true;
const CACHE_SECONDS = 300;
const INCLUDE_SHEET_LINKS = true;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const includeAll = String(params.all || '').toLowerCase() === 'true';
  const includeLongStay = String(params.includeLongStay || '').toLowerCase() === 'true';
  const refresh = String(params.refresh || '').toLowerCase() === 'true';
  const schemaOnly = String(params.schema || '').toLowerCase() === 'true';
  const callback = params.callback;

  const approvedOnly = !includeAll && APPROVED_ONLY_DEFAULT;
  const excludeLongStay = !includeLongStay && EXCLUDE_LONG_STAY_DEFAULT;

  const hasDynamicFilter = Boolean(params.record || params.property || params.q || schemaOnly || includeLongStay);
  const cacheKey = [
    'guq_catalogue_v2',
    approvedOnly ? 'approved' : 'all',
    excludeLongStay ? 'daily' : 'with_long_stay'
  ].join('_');

  const cache = CacheService.getScriptCache();

  if (!refresh && !hasDynamicFilter) {
    const cached = cache.get(cacheKey);
    if (cached) return output_(cached, callback);
  }

  const payload = getCataloguePayload_(approvedOnly, {
    excludeLongStay,
    schemaOnly,
    record: params.record || '',
    property: params.property || '',
    q: params.q || ''
  });

  const json = JSON.stringify(payload);

  if (!hasDynamicFilter) {
    try {
      cache.put(cacheKey, json, CACHE_SECONDS);
    } catch (err) {
      console.log('Cache skipped: ' + err);
    }
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

function getCataloguePayload_(approvedOnly, options) {
  options = options || {};
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

  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length < 2) {
    return {
      ok: true,
      source: ss.getName(),
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheet: SHEET_NAME,
      sheetId: sheet.getSheetId(),
      updatedAt: new Date().toISOString(),
      count: 0,
      columns: [],
      rows: []
    };
  }

  const headers = values[0].map(h => String(h || '').trim());
  const headerIndex = {};
  headers.forEach((h, i) => {
    if (h) headerIndex[h] = i;
  });

  const lastColLetter = columnToLetter_(headers.length);
  const columns = headers.map((name, index) => ({
    name,
    index,
    column: columnToLetter_(index + 1)
  }));

  if (options.schemaOnly) {
    return {
      ok: true,
      source: ss.getName(),
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheet: SHEET_NAME,
      sheetId: sheet.getSheetId(),
      updatedAt: new Date().toISOString(),
      rowCount: Math.max(values.length - 1, 0),
      columns
    };
  }

  const rows = [];
  const recordFilter = String(options.record || '').trim().toLowerCase();
  const propertyFilter = String(options.property || '').trim().toLowerCase();
  const queryFilter = String(options.q || '').trim().toLowerCase();

  for (let i = 1; i < values.length; i++) {
    const rowValues = values[i];
    const row = {};

    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = cleanValue_(rowValues[index]);
    });

    const hasProperty = String(row['Property Name'] || '').trim() !== '';
    const hasRoom = String(row['Room Type'] || row['Unit Type'] || '').trim() !== '';
    if (!hasProperty && !hasRoom) continue;

    const status = String(row['Approval Status'] || '').trim().toLowerCase();
    if (approvedOnly && status !== 'approved') continue;

    const stayType = String(row['Stay Type'] || row['Rate Basis'] || '').trim().toLowerCase();
    if (options.excludeLongStay && stayType.includes('long')) continue;

    if (recordFilter && String(row['Record ID'] || '').trim().toLowerCase() !== recordFilter) continue;
    if (propertyFilter && !String(row['Property Name'] || '').trim().toLowerCase().includes(propertyFilter)) continue;

    if (queryFilter) {
      const haystack = headers.map(h => row[h]).join(' ').toLowerCase();
      if (!haystack.includes(queryFilter)) continue;
    }

    const rowNumber = i + 1;
    const rowRange = `${SHEET_NAME}!A${rowNumber}:${lastColLetter}${rowNumber}`;
    const rowUrl = INCLUDE_SHEET_LINKS
      ? `${ss.getUrl()}#gid=${sheet.getSheetId()}&range=${encodeURIComponent(rowRange)}`
      : '';

    row._trace = {
      recordId: String(row['Record ID'] || '').trim(),
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      sheet: SHEET_NAME,
      sheetId: sheet.getSheetId(),
      rowNumber,
      rowRange,
      rowUrl,
      sourceContract: extractSourceContract_(row),
      lastUpdated: row['Last Updated'] || '',
      columns
    };

    rows.push(row);
  }

  return {
    ok: true,
    source: ss.getName(),
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheet: SHEET_NAME,
    sheetId: sheet.getSheetId(),
    updatedAt: new Date().toISOString(),
    approvedOnly,
    excludeLongStay: options.excludeLongStay,
    count: rows.length,
    columns,
    rows
  };
}

function extractSourceContract_(row) {
  if (row['Source Contract']) return String(row['Source Contract']).trim();

  const internal = String(row['Internal Notes'] || '');
  const match = internal.match(/Source:\s*([^.;]+(?:\.pdf|\.xlsx|\.xls)?)/i);
  if (match) return match[1].trim();

  return '';
}

function cleanValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : '';

  if (value === null || value === undefined) return '';

  return String(value).trim();
}

function columnToLetter_(columnNumber) {
  let temp = '';
  let letter = '';

  while (columnNumber > 0) {
    temp = (columnNumber - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    columnNumber = (columnNumber - temp - 1) / 26;
  }

  return letter;
}

function clearCatalogueCache() {
  const cache = CacheService.getScriptCache();
  ['guq_catalogue_v2_approved_daily', 'guq_catalogue_v2_all_daily', 'guq_catalogue_v2_approved_with_long_stay', 'guq_catalogue_v2_all_with_long_stay']
    .forEach(key => cache.remove(key));
  Logger.log('GU-Q catalogue cache cleared.');
}

function testCatalogueAPI() {
  const data = getCataloguePayload_(true, { excludeLongStay: true });
  Logger.log(JSON.stringify({
    ok: data.ok,
    count: data.count,
    firstRecord: data.rows[0] && data.rows[0]._trace
  }, null, 2));
}

function testCatalogueSchema() {
  const data = getCataloguePayload_(true, { schemaOnly: true });
  Logger.log(JSON.stringify(data, null, 2));
}
