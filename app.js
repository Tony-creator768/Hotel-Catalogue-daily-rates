const CONFIG = window.CATALOGUE_CONFIG || {};
const SAMPLE = window.SAMPLE_CATALOGUE_DATA || { rows: [] };

const GUQ_FUNDED_RESERVATION_URL = "https://me.cflowapps.com/cflow/publicform/workflowform?id=9wOpwb956HEVSDGz1H3YQ3cspJ852wh6DwYVg35qeC7PwZ6mbBE23we01Lq4whvi";

let catalogueRows = [];
let filteredRows = [];
let filteredGroups = [];
const selectedForCompare = new Map();
const compareRateSelections = new Map();

const els = {
  grid: document.querySelector("#catalogueGrid"),
  search: document.querySelector("#searchInput"),
  area: document.querySelector("#areaFilter"),
  category: document.querySelector("#categoryFilter"),
  bedrooms: document.querySelector("#bedroomFilter"),
  breakfast: document.querySelector("#petFilter"),
  sort: document.querySelector("#sortSelect"),
  count: document.querySelector("#resultCount"),
  propertyCount: document.querySelector("#propertyCount"),
  minRate: document.querySelector("#minRate"),
  breakfastCount: document.querySelector("#petCount"),
  updatedAt: document.querySelector("#updatedAt"),
  modal: document.querySelector("#detailModal"),
  modalBody: document.querySelector("#modalBody"),
  compareDrawer: document.querySelector("#compareDrawer"),
  compareContent: document.querySelector("#compareContent")
};

function get(row, key) {
  return row[key] ?? "";
}

function field(row, keys) {
  for (const key of keys) {
    const value = get(row, key);
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "property";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortText(value, length = 145) {
  const text = compactText(value);
  if (text.length <= length) return text;
  return `${text.slice(0, length)}…`;
}

function formatMoney(value) {
  const number = toNumber(value);
  if (!number) return "Rate on request";
  return `QAR ${number.toLocaleString()}`;
}

function formatDateRange(row) {
  const validDates = field(row, ["Valid Dates"]);
  if (validDates) return validDates;

  const start = field(row, ["Season Start", "Valid From", "Agreement Start"]);
  const end = field(row, ["Season End", "Valid To", "Agreement End"]);
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "";
}

function normalizeSizeText(size) {
  const raw = String(size || "").trim();
  if (!raw) return "";
  if (/sqm|sq\.?\s*m|m²/i.test(raw)) {
    return raw.replace(/sq\.?\s*m/ig, "sqm").replace(/m²/ig, "sqm");
  }
  return `${raw} sqm`;
}

function extractSizeFromRoomType(row) {
  const roomType = String(field(row, ["Room Type", "Unit Type"]) || "");
  const match = roomType.match(/\(?\s*(\d+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m|m²)(?:\s*(?:to|-|–)\s*\d+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m|m²)?)?)\s*\)?/i);
  if (!match) return "";
  return match[1].replace(/sq\.?\s*m/ig, "sqm").replace(/m²/ig, "sqm");
}

function sizeOnlyLabel(row) {
  const size = normalizeSizeText(field(row, ["Size SQM", "Size"]));
  if (size) return size;
  return extractSizeFromRoomType(row);
}

function firstLink(row) {
  return String(
    field(row, [
      "Room Video URL",
      "Unit Video URL",
      "Room Detail URL",
      "Unit Detail URL",
      "Virtual Tour URL",
      "Website URL",
      "Flyer URL"
    ]) || ""
  ).trim();
}

function initials(name) {
  return String(name || "Hotel")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(word => word[0])
    .join("")
    .toUpperCase();
}

function mediaHtml(item) {
  const image = String(item.image || "").trim();
  const name = item.name || "Hotel";
  if (image) {
    return `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="eager" onerror="this.remove(); this.parentElement.insertAdjacentHTML('beforeend','<div class=&quot;media-initials&quot;>${initials(name)}</div>')">`;
  }
  return `<div class="media-initials">${initials(name)}</div>`;
}

function splitList(value) {
  return String(value || "")
    .split(/\s*[|;•]\s*|\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueItems(items) {
  const seen = new Set();
  const out = [];
  items.forEach(item => {
    const key = compactText(item).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function amenitiesText(row) {
  return uniqueItems([
    field(row, ["Amenities / Inclusions"]),
    field(row, ["Additional Information / Amenities Notes", "Additional Information"]),
    field(row, ["Supplements / Blackouts"]),
    field(row, ["Rate Notes"]),
    field(row, ["Booking / Display Notes"])
  ].filter(Boolean)).join(" | ");
}

function amenityChipsHtml(value, limit = 4) {
  const items = splitList(value);
  if (!items.length) return `<div class="amenities">Amenities not listed</div>`;

  const visible = items.slice(0, limit);
  const more = items.length - visible.length;

  return `
    <div class="amenity-chips">
      ${visible.map(item => `<span class="amenity-chip">${escapeHtml(shortText(item, 34))}</span>`).join("")}
      ${more > 0 ? `<span class="amenity-chip">+${more} more</span>` : ""}
    </div>
  `;
}

function dailyRate(row) {
  return toNumber(field(row, [
    "Daily Rate QAR",
    "Single Occupancy Rate QAR",
    "Corporate Rate SNG QAR",
    "Single Rate QAR"
  ]));
}

function doubleRate(row) {
  return toNumber(field(row, [
    "Double Occupancy Rate QAR",
    "Corporate Rate DBL QAR",
    "Double Rate QAR"
  ]));
}

function rateHtml(row) {
  const single = toNumber(field(row, ["Single Occupancy Rate QAR", "Corporate Rate SNG QAR", "Single Rate QAR"]));
  const dbl = doubleRate(row);
  const daily = toNumber(field(row, ["Daily Rate QAR"]));

  return `
    <div class="rate-duo">
      ${single ? `<strong>SNG ${formatMoney(single)}</strong>` : daily ? `<strong>${formatMoney(daily)}</strong>` : `<strong>Rate on request</strong>`}
      ${dbl ? `<small>DBL ${formatMoney(dbl)}</small>` : `<small>per night</small>`}
    </div>
  `;
}

function roomTypeLabel(row) {
  return String(field(row, ["Room Type", "Unit Type"]) || "Room type not listed").trim();
}

function rateSubline(row) {
  const pieces = [
    field(row, ["Season"]),
    formatDateRange(row),
    field(row, ["Breakfast Included"]) ? `Breakfast: ${field(row, ["Breakfast Included"])}` : "",
    sizeOnlyLabel(row)
  ].filter(Boolean);
  return uniqueItems(pieces).join(" • ");
}

function unitRowHtml(row, compact = false) {
  const href = firstLink(row);
  const content = `
    <div>
      <strong>${escapeHtml(roomTypeLabel(row))}</strong>
      <span>${escapeHtml(rateSubline(row) || field(row, ["Rate Basis"]) || "Daily contract rate")}</span>
    </div>
    <div class="unit-side">
      ${rateHtml(row)}
      ${href ? `<span class="unit-link-label">View room</span>` : `<span class="unit-link-label muted-link">No link</span>`}
    </div>
  `;
  if (href) {
    return `<a class="unit-row unit-row-link${compact ? " compact" : ""}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
  }
  return `<div class="unit-row${compact ? " compact" : ""}">${content}</div>`;
}

function normalizeRows(rows) {
  return (rows || [])
    .filter(row => field(row, ["Property Name"]) || field(row, ["Room Type", "Unit Type"]))
    .filter(row => {
      if (!CONFIG.APPROVED_ONLY) return true;
      return String(field(row, ["Approval Status"]) || "Approved").toLowerCase() === "approved";
    })
    .filter(row => !String(field(row, ["Stay Type"]) || "").toLowerCase().includes("long"))
    .map((row, index) => {
      const name = String(field(row, ["Property Name"]) || "Unnamed property").trim();
      const area = String(field(row, ["Area"]) || "").trim();
      const room = roomTypeLabel(row);
      const bedroom = String(field(row, ["Bedrooms"]) || "").trim();
      const id = field(row, ["Record ID"]) || `CAT-${String(index + 1).padStart(3, "0")}`;
      const search = [
        name,
        field(row, ["Category"]),
        area,
        field(row, ["Address"]),
        room,
        bedroom,
        field(row, ["Season"]),
        field(row, ["Valid Dates"]),
        field(row, ["Breakfast Included"]),
        amenitiesText(row),
        field(row, ["Cancellation Policy"]),
        field(row, ["Reservation Method"]),
        field(row, ["Contact Name"]),
        field(row, ["Contact Email"])
      ].join(" ").toLowerCase();

      return {
        ...row,
        _id: String(id),
        _propertyKey: normalizeKey(`${name} ${area}`),
        _rateQar: dailyRate(row),
        _unitOrder: toNumber(field(row, ["Unit Display Order"])),
        _bedrooms: bedroom,
        _roomTypeSimple: bedroom || room.replace(/\(.*?\)/g, "").trim(),
        _search: search
      };
    });
}

function uniqueOptions(rows, getter) {
  return [...new Set(rows.map(getter).map(value => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function fillSelect(select, values, defaultLabel) {
  select.innerHTML = `<option value="">${defaultLabel}</option>` + values
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

function sortRateRows(rows) {
  return [...rows].sort((a, b) => {
    const orderA = a._unitOrder || 9999;
    const orderB = b._unitOrder || 9999;
    if (orderA !== orderB) return orderA - orderB;

    const dateA = String(field(a, ["Season Start", "Agreement Start"]) || "");
    const dateB = String(field(b, ["Season Start", "Agreement Start"]) || "");
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    return (a._rateQar || Infinity) - (b._rateQar || Infinity);
  });
}

function firstNonEmpty(rows, keys) {
  const found = rows.find(row => field(row, keys));
  return found ? field(found, keys) : "";
}

function groupRows(rows) {
  const map = new Map();

  rows.forEach(row => {
    const name = String(field(row, ["Property Name"]) || "Unnamed property").trim();
    const area = String(field(row, ["Area"]) || "").trim();
    const key = normalizeKey(`${name} ${area}`);
    if (!map.has(key)) map.set(key, { _id: key, name, area, rows: [] });
    map.get(key).rows.push(row);
  });

  return [...map.values()].map(group => {
    const rowsSorted = sortRateRows(group.rows);
    const allRows = sortRateRows(catalogueRows.filter(row => row._propertyKey === group._id));
    const rates = rowsSorted.map(row => row._rateQar).filter(Boolean);

    const categories = uniqueOptions(rowsSorted, row => field(row, ["Category"]));
    const breakfast = uniqueOptions(rowsSorted, row => field(row, ["Breakfast Included"]));
    const roomTypes = uniqueOptions(rowsSorted, row => row._bedrooms || roomTypeLabel(row));

    return {
      ...group,
      rows: rowsSorted,
      allRows,
      category: categories.join(" / "),
      address: firstNonEmpty(rowsSorted, ["Address"]),
      image: firstNonEmpty(rowsSorted, ["Image URL", "Room Image URL", "Unit Image URL"]),
      website: firstNonEmpty(rowsSorted, ["Website URL"]),
      virtualTour: firstNonEmpty(rowsSorted, ["Virtual Tour URL"]),
      flyer: firstNonEmpty(rowsSorted, ["Flyer URL"]),
      gallery: firstNonEmpty(rowsSorted, ["Gallery URLs"]),
      contactName: firstNonEmpty(rowsSorted, ["Contact Name"]),
      contactEmail: firstNonEmpty(rowsSorted, ["Contact Email"]),
      contactPhone: firstNonEmpty(rowsSorted, ["Contact Phone"]),
      amenities: uniqueItems(rowsSorted.map(amenitiesText).filter(Boolean)).join(" | "),
      cancellation: uniqueItems(rowsSorted.map(row => field(row, ["Cancellation Policy"])).filter(Boolean)).join(" | "),
      supplements: uniqueItems(rowsSorted.map(row => field(row, ["Supplements / Blackouts"])).filter(Boolean)).join(" | "),
      payment: uniqueItems(rowsSorted.map(row => field(row, ["Payment / Billing"])).filter(Boolean)).join(" | "),
      reservation: uniqueItems(rowsSorted.map(row => field(row, ["Reservation Method"])).filter(Boolean)).join(" | "),
      checkIn: firstNonEmpty(rowsSorted, ["Check-In"]),
      checkOut: firstNonEmpty(rowsSorted, ["Check-Out"]),
      minRate: rates.length ? Math.min(...rates) : 0,
      maxRate: rates.length ? Math.max(...rates) : 0,
      roomTypes,
      breakfast,
      unitCount: rowsSorted.length,
      _search: rowsSorted.map(row => row._search).join(" ")
    };
  });
}

function rateRange(group) {
  if (group.minRate && group.maxRate) {
    if (group.minRate === group.maxRate) return formatMoney(group.minRate);
    return `${formatMoney(group.minRate)} – ${formatMoney(group.maxRate)}`;
  }
  return "Rate on request";
}

function breakfastLabel(group) {
  const combined = String((group.breakfast || []).join(" / ")).toLowerCase();
  if (combined.includes("yes")) return "Breakfast included";
  if (combined.includes("no")) return "Breakfast not included / not listed";
  return "Breakfast not listed";
}

function renderStats(rows, groups) {
  const dailyRates = rows.map(row => row._rateQar).filter(Boolean);
  const breakfastRows = rows.filter(row => String(field(row, ["Breakfast Included"])).toLowerCase().includes("yes"));

  els.count.textContent = `${rows.length} daily rate row${rows.length === 1 ? "" : "s"}`;
  els.propertyCount.textContent = groups.length;
  els.minRate.textContent = dailyRates.length ? `${Math.min(...dailyRates).toLocaleString()} QAR` : "—";
  els.breakfastCount.textContent = breakfastRows.length;
}

function renderCards(groups) {
  if (!groups.length) {
    els.grid.innerHTML = `<div class="empty">No matching hotels. Check filters or Approval Status in Google Sheets.</div>`;
    return;
  }

  els.grid.innerHTML = groups.map(group => {
    const id = group._id;
    const isSelected = selectedForCompare.has(id);

    return `
      <article class="card hotel-card">
        <div class="card-media">
          ${mediaHtml(group)}
          <span class="badge">${escapeHtml(group.category || "Hotel / Residence")}</span>
        </div>

        <div class="card-body">
          <div class="hotel-title-row">
            <h3>${escapeHtml(group.name)}</h3>
          </div>

          <div class="unit">
            ${escapeHtml(group.area || "Area not listed")}${group.address ? ` • ${escapeHtml(group.address)}` : ""}
          </div>

          <div class="meta">
            <span class="pill">${group.unitCount} daily rate row${group.unitCount === 1 ? "" : "s"}</span>
            <span class="pill">${escapeHtml(breakfastLabel(group))}</span>
            <span class="pill">${escapeHtml(rateRange(group))}</span>
          </div>

          ${amenityChipsHtml(group.amenities, 4)}

          <div class="unit-list-head">
            <strong>Daily room rates</strong>
            <span>Single/double occupancy where available</span>
          </div>

          <div class="unit-list">
            ${group.rows.map(row => unitRowHtml(row, true)).join("")}
          </div>

          <div class="card-actions">
            <button class="primary" onclick="openDetails('${escapeHtml(id)}')">View details</button>
            <button class="${isSelected ? "compare-selected" : "ghost"}" onclick="toggleCompare('${escapeHtml(id)}')">
              ${isSelected ? "Selected" : "Compare"}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function applyFilters() {
  const query = String(els.search.value || "").toLowerCase().trim();
  const area = els.area.value;
  const category = els.category.value;
  const roomChoice = els.bedrooms.value;
  const breakfast = els.breakfast.value;
  const sort = els.sort.value;

  filteredRows = catalogueRows.filter(row => {
    const matchesSearch = !query || row._search.includes(query);
    const matchesArea = !area || field(row, ["Area"]) === area;
    const matchesCategory = !category || field(row, ["Category"]) === category;
    const matchesRoom = !roomChoice || row._bedrooms === roomChoice || roomTypeLabel(row).includes(roomChoice);
    const breakfastText = String(field(row, ["Breakfast Included"]) || "").toLowerCase();
    const matchesBreakfast =
      !breakfast ||
      (breakfast === "yes" && breakfastText.includes("yes")) ||
      (breakfast === "no" && !breakfastText.includes("yes"));

    return matchesSearch && matchesArea && matchesCategory && matchesRoom && matchesBreakfast;
  });

  filteredGroups = groupRows(filteredRows);

  if (sort === "price-low") {
    filteredGroups.sort((a, b) => (a.minRate || Infinity) - (b.minRate || Infinity));
  } else if (sort === "price-high") {
    filteredGroups.sort((a, b) => (b.maxRate || 0) - (a.maxRate || 0));
  } else {
    filteredGroups.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderStats(filteredRows, filteredGroups);
  renderCards(filteredGroups);
  renderCompare();
}

function findGroup(id) {
  return groupRows(catalogueRows).find(group => group._id === id);
}

function detailTableRows(rows) {
  return rows.map(row => `
    <tr>
      <td>${escapeHtml(roomTypeLabel(row))}</td>
      <td>${escapeHtml(field(row, ["Season"]) || "—")}<div class="rate-meta">${escapeHtml(formatDateRange(row))}</div></td>
      <td>${formatMoney(field(row, ["Single Occupancy Rate QAR", "Daily Rate QAR"]))}</td>
      <td>${doubleRate(row) ? formatMoney(doubleRate(row)) : "—"}</td>
      <td>${escapeHtml(field(row, ["Breakfast Included"]) || "—")}</td>
      <td>${escapeHtml(shortText(field(row, ["Rate Basis"]) || "Per room, per night", 120))}</td>
    </tr>
  `).join("");
}

function policyBlock(title, text) {
  if (!text) return "";
  return `
    <div class="policy-item">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function linksHtml(group) {
  const links = [
    ["Website", group.website],
    ["Virtual tour", group.virtualTour],
    ["Flyer", group.flyer],
    ["Gallery", group.gallery]
  ].filter(([, url]) => url);

  if (!links.length) return "";

  return `
    <div class="links">
      ${links.map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`).join("")}
    </div>
  `;
}

function openDetails(id) {
  const group = findGroup(id);
  if (!group) return;

  const rows = group.allRows || group.rows;
  const visibility = String(firstNonEmpty(rows, ["Catalogue Visibility"]) || "").toLowerCase();

  els.modalBody.innerHTML = `
    <div class="modal-card">
      <div class="modal-hero">
        ${mediaHtml(group)}
        <button class="close" onclick="closeDetails()">Close</button>
      </div>

      <div class="modal-content">
        <h2>${escapeHtml(group.name)}</h2>
        <p class="unit">${escapeHtml(group.area || "Area not listed")}${group.address ? ` • ${escapeHtml(group.address)}` : ""}</p>
        ${visibility.includes("internal") ? `<p class="internal-warning">Internal catalogue note: negotiated contract rates may be confidential. Do not publish externally without approval.</p>` : ""}

        <table class="contract-table">
          <thead>
            <tr>
              <th>Room Type</th>
              <th>Season / Validity</th>
              <th>SNG / Daily</th>
              <th>DBL</th>
              <th>Breakfast</th>
              <th>Basis</th>
            </tr>
          </thead>
          <tbody>${detailTableRows(rows)}</tbody>
        </table>

        <div class="details-grid" style="margin-top:14px;">
          <div class="detail-block full">
            <h4>Amenities / inclusions / additional information</h4>
            <p>${escapeHtml(group.amenities || "Amenities not listed")}</p>
          </div>

          <div class="detail-block">
            <h4>Supplements / blackouts</h4>
            <p>${escapeHtml(group.supplements || "Not listed")}</p>
          </div>

          <div class="detail-block">
            <h4>Contact / booking</h4>
            <p>${escapeHtml([
              group.contactName,
              group.contactEmail,
              group.contactPhone,
              group.reservation ? `Reservation method: ${group.reservation}` : ""
            ].filter(Boolean).join("\\n") || "Contact not listed")}</p>
          </div>

          <div class="detail-block full">
            <h4>Policies</h4>
            <div class="policy-list">
              ${policyBlock("Cancellation", group.cancellation)}
              ${policyBlock("Check-in / Check-out", [group.checkIn ? `Check-in: ${group.checkIn}` : "", group.checkOut ? `Check-out: ${group.checkOut}` : ""].filter(Boolean).join(" | "))}
              ${policyBlock("Payment / billing", group.payment)}
            </div>
          </div>
        </div>

        ${linksHtml(group)}
      </div>
    </div>
  `;

  els.modal.classList.add("open");
}

function closeDetails() {
  els.modal.classList.remove("open");
  els.modalBody.innerHTML = "";
}

function toggleCompare(id) {
  const group = findGroup(id);
  if (!group) return;

  if (selectedForCompare.has(id)) {
    selectedForCompare.delete(id);
    compareRateSelections.delete(id);
  } else {
    if (selectedForCompare.size >= 6) {
      alert("You can compare up to 6 hotels at once.");
      return;
    }
    selectedForCompare.set(id, group);
    compareRateSelections.set(id, (group.rows[0] || {})._id);
  }

  renderCards(filteredGroups);
  renderCompare();
}

function removeCompare(id) {
  selectedForCompare.delete(id);
  compareRateSelections.delete(id);
  renderCards(filteredGroups);
  renderCompare();
}

function updateCompareRate(groupId, rowId) {
  compareRateSelections.set(groupId, rowId);
  renderCompare();
}

function selectedRateForGroup(group) {
  const selectedId = compareRateSelections.get(group._id);
  return group.allRows.find(row => row._id === selectedId) || group.allRows[0] || group.rows[0];
}

function mailtoLink(group, row) {
  const email = field(row, ["Contact Email"]) || group.contactEmail || "";
  const subject = `Daily hotel rate request - ${group.name}`;
  const body = [
    "Hello,",
    "",
    "I would like to request availability and confirmation for the following GU-Q daily hotel rate:",
    "",
    `Property: ${group.name}`,
    `Room Type: ${roomTypeLabel(row)}`,
    `Season/Validity: ${field(row, ["Season"]) || ""} ${formatDateRange(row)}`,
    `Single/Daily Rate: ${field(row, ["Single Occupancy Rate QAR", "Daily Rate QAR"]) ? formatMoney(field(row, ["Single Occupancy Rate QAR", "Daily Rate QAR"])) : "Rate on request"}`,
    `Double Rate: ${doubleRate(row) ? formatMoney(doubleRate(row)) : "N/A"}`,
    "",
    "Please confirm availability, final rate, applicable supplements, taxes, cancellation terms, and booking requirements.",
    "",
    "Best regards,"
  ].join("\n");

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function renderCompare() {
  if (!selectedForCompare.size) {
    els.compareDrawer.classList.remove("open");
    els.compareContent.innerHTML = "";
    return;
  }

  const groups = [...selectedForCompare.values()].map(group => findGroup(group._id)).filter(Boolean);

  els.compareDrawer.classList.add("open");
  els.compareContent.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Hotel</th>
          <th>Selected daily rate</th>
          <th>Rate</th>
          <th>Amenities / key notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${groups.map(group => {
          const row = selectedRateForGroup(group);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(group.name)}</strong>
                <div class="rate-meta">${escapeHtml(group.area || "")}</div>
              </td>
              <td>
                <select onchange="updateCompareRate('${escapeHtml(group._id)}', this.value)">
                  ${group.allRows.map(option => `
                    <option value="${escapeHtml(option._id)}" ${option._id === row._id ? "selected" : ""}>
                      ${escapeHtml(roomTypeLabel(option))} — ${escapeHtml(field(option, ["Season"]) || "Daily rate")}
                    </option>
                  `).join("")}
                </select>
              </td>
              <td>${rateHtml(row)}</td>
              <td>${escapeHtml(shortText(amenitiesText(row), 180))}</td>
              <td>
                <div class="compare-actions">
                  <a class="primary" href="${GUQ_FUNDED_RESERVATION_URL}" target="_blank" rel="noopener noreferrer">GU-Q funded</a>
                  <a class="button-link" href="${mailtoLink(group, row)}" target="_blank" rel="noopener noreferrer">Self-funded email</a>
                  <button class="remove-small" onclick="removeCompare('${escapeHtml(group._id)}')">Remove</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadFromFetch(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    method: "GET",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function loadFromJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `catalogueCallback_${Date.now()}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";
    let finished = false;

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = data => {
      if (finished) return;
      finished = true;
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("JSONP load failed"));
    };

    script.src = `${url}${separator}callback=${callbackName}&t=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function isAppsScriptUrl(url) {
  return /script\.google\.com|script\.googleusercontent\.com/i.test(url);
}

async function loadData() {
  const url = String(CONFIG.DATA_URL || "").trim();

  if (!url || url.includes("PASTE_YOUR")) {
    return SAMPLE;
  }

  if (isAppsScriptUrl(url)) {
    try {
      return await withTimeout(loadFromJsonp(url), 9000, "Apps Script JSONP");
    } catch (jsonpError) {
      console.warn("JSONP failed. Trying fetch fallback.", jsonpError);
      try {
        return await withTimeout(loadFromFetch(url), 9000, "Apps Script fetch");
      } catch (fetchError) {
        console.warn("Fetch failed. Using sample data fallback.", fetchError);
        return SAMPLE;
      }
    }
  }

  try {
    return await withTimeout(loadFromFetch(url), 9000, "Data fetch");
  } catch (fetchError) {
    console.warn("Fetch failed. Trying JSONP fallback.", fetchError);
    try {
      return await withTimeout(loadFromJsonp(url), 9000, "JSONP fallback");
    } catch (jsonpError) {
      console.warn("JSONP failed. Using sample data.", jsonpError);
      return SAMPLE;
    }
  }
}

function setupFilters() {
  fillSelect(els.area, uniqueOptions(catalogueRows, row => field(row, ["Area"])), "All areas");
  fillSelect(els.category, uniqueOptions(catalogueRows, row => field(row, ["Category"])), "All categories");
  fillSelect(els.bedrooms, uniqueOptions(catalogueRows, row => row._bedrooms || roomTypeLabel(row)), "All rooms/bedrooms");
}

function setupEvents() {
  [els.search, els.area, els.category, els.bedrooms, els.breakfast, els.sort].forEach(el => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  document.querySelector("#refreshBtn").addEventListener("click", async () => {
    await init(true);
  });

  document.querySelector("#printBtn").addEventListener("click", () => window.print());

  els.modal.addEventListener("click", event => {
    if (event.target === els.modal) closeDetails();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDetails();
  });
}

async function init(forceRefresh = false) {
  els.updatedAt.textContent = "Loading data...";
  const data = await loadData(forceRefresh);
  catalogueRows = normalizeRows(data.rows || []);
  filteredRows = catalogueRows;
  filteredGroups = groupRows(filteredRows);

  setupFilters();
  applyFilters();

  const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "not listed";
  els.updatedAt.textContent = `Data source: ${escapeHtml(data.source || "Google Sheet")} • Updated: ${updated}`;
}

setupEvents();
init();
