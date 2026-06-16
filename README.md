# GU-Q Daily Hotel Room Rates Catalogue - Full Package

This package contains the updated website, the Google Apps Script API, and the Excel source workbook.

## What changed

### 1. Traceability back to Google Sheets
Every row returned by the new `Code.gs` API still includes a `_trace` object with:

- `recordId`
- `spreadsheetName`
- `spreadsheetUrl`
- `sheet`
- `sheetId`
- `rowNumber`
- `rowRange`
- `rowUrl`
- `sourceContract`
- `lastUpdated`

The website keeps this data available for auditing through the API, but the **View details** modal and the **Compare** drawer no longer show Google Sheet traceability, source rows, record IDs, or source contract filenames. This keeps the public-facing interface clean while the backend can still be audited when needed.

### 2. Apps Script API upgrades
The updated `Code.gs` keeps your one-sheet setup but adds:

- Dynamic schema output with `?schema=true`
- Row-level traceability metadata
- Direct Google Sheet row links
- Record lookup with `?record=CAT-001`
- Property lookup with `?property=Hilton`
- Keyword lookup with `?q=breakfast`
- Cache refresh with `?refresh=true`
- Approved-only default filtering
- Long-stay/monthly row exclusion by default

### 3. Compare menu redesign
The compare area is now a sticky card-based drawer rather than a dense table.

Improvements:

- Select up to 6 hotels
- Collapse/expand the compare drawer
- Clear all
- Choose the room per hotel from a clearer dropdown
- Highlight the lowest selected rate
- Show only the clean comparison essentials: room type, size, selected rate, and breakfast status
- Hide supplements/blackouts, cancellation details, validity dates, Record ID, Sheet Row, and source contract filename from the compare drawer
- Quick actions: Details, GU-Q funded booking, Email hotel

## File structure

- `index.html` - main catalogue page
- `styles.css` - updated visual styling and compare menu styling
- `app.js` - updated frontend logic
- `config.js` - website configuration
- `sample-data.js` - offline fallback generated from the attached Excel workbook
- `Code.gs` - Google Apps Script API
- `daily_rates_sheet_catalogue_with_latest_contracts.xlsx` - Excel source workbook

## Google Sheets setup

1. Upload `daily_rates_sheet_catalogue_with_latest_contracts.xlsx` to Google Drive.
2. Open it with Google Sheets.
3. Confirm the tab is named exactly:

   `Catalogue_View`

4. Open `Extensions > Apps Script`.
5. Replace the existing Apps Script file with `Code.gs`.
6. Click `Deploy > New deployment > Web app`.
7. Use:
   - Execute as: `Me`
   - Access: `Anyone in Georgetown` or the access level you need
8. Copy the deployed `/exec` URL.
9. Paste that URL into `config.js` under `DATA_URL`.

## Test URLs

After deployment, test the Apps Script URL in a browser:

```text
<YOUR_EXEC_URL>?schema=true
<YOUR_EXEC_URL>?record=CAT-001
<YOUR_EXEC_URL>?property=Hilton
<YOUR_EXEC_URL>?refresh=true
```

A successful response includes:

```json
{
  "ok": true,
  "sheet": "Catalogue_View",
  "count": 212,
  "rows": [
    {
      "Record ID": "CAT-001",
      "...": "...",
      "_trace": {
        "rowNumber": 2,
        "rowRange": "Catalogue_View!A2:AN2",
        "rowUrl": "..."
      }
    }
  ]
}
```

## Important operational notes

- If you edit the Google Sheet, the website can show cached data for up to 5 minutes.
- Use the website's **Refresh data** button or call `?refresh=true` to bypass the Apps Script cache.
- If the website says `trace metadata not returned; redeploy Code.gs`, the website is still reading data, but the old Apps Script code is still deployed.
- Keep the Google Sheet column headers stable. The frontend reads by header name, not by column number, but the core columns must remain present.

## Core columns the website expects

The frontend works best when these headers exist in `Catalogue_View`:

- Record ID
- Approval Status
- Property Name
- Category
- Area
- Address
- Season
- Valid Dates
- Season Start
- Season End
- Room Type
- Bedrooms
- Size SQM
- Single Occupancy Rate QAR
- Double Occupancy Rate QAR
- Rate Basis
- Currency
- Breakfast Included
- Amenities / Inclusions
- Supplements / Blackouts
- Cancellation Policy
- Check-In
- Check-Out
- Payment / Billing
- Reservation Method
- Contact Name
- Contact Email
- Contact Phone
- Website URL
- Virtual Tour URL
- Flyer URL
- Image URL
- Gallery URLs
- Room Detail URL
- Room Video URL
- Room Image URL
- Unit Display Order
- Booking / Display Notes
- Internal Notes
- Last Updated

## Latest edit - unit size display

- On the hotel cards, each room/unit row now shows only the room size under the unit name.
- Removed season, view, record ID, sheet row, and source contract text from the small line under each unit.
- Changed the card counter from “source rows shown” to “units shown” for a cleaner public-facing display.
- Removed Google Sheet traceability from the View details area.
- Removed the Source row column from the View details room-rate table.
- Changed the View details eyebrow from “Google Sheet traceable contract data” to “Contract rate details.”
- Fixed a small details-modal typo so policy text displays correctly when opening View details.


## Latest edit - clean compare drawer

- Removed supplements/blackouts from the compare popup.
- Removed cancellation details from the compare popup.
- Removed validity/date details from the compare popup and compare dropdown.
- Removed Record ID, Sheet row, row links, and source contract filename from the compare popup.
- Simplified the compare dropdown label from “Choose room / season” to “Choose room.”
- Cleaned the “Email hotel” draft generated from the compare drawer so it no longer includes Record ID, Sheet row, validity, supplements, or cancellation wording.
