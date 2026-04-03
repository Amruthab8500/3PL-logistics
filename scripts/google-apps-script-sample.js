/**
 * Google Apps Script for Style Asia 3PL — bound to your Spreadsheet.
 * Deploy → Web app → Execute as: Me, Who has access: Anyone (or your org).
 *
 * FULL COLUMN LAYOUT (37 columns A–AK). Row 1 should match SHEET_HEADERS below — same order as your manual headers:
 *   … Additional Requirements | Timeline | Volume | Status | Notes | Files
 * If you still use a legacy 12-column row, Pull keeps working; new appends use the wide layout.
 *
 * Status column: found by header name "Status" (works after layout changes).
 *
 * STAFF LOGIN (optional): add a tab named **Staff** (any letter case). Row 1 headers — include Password plus an email
 * column (Email, E-mail, Login, …). Optional: Name, IsAdmin (yes/true/1/admin).
 * Row 2+ = one staff user per row. Plain-text passwords — restrict Sheet access. Redeploy the script after edits.
 * Script must live in the same spreadsheet (Extensions → Apps Script) so getActiveSpreadsheet() works.
 *
 * Staff mutations: POST action upsertStaffUser { email, password, name, isAdmin } — add or update a row.
 * removeStaffUser { email } — delete that user's row. Same security as lead POST (webhook URL must stay private).
 */

/** Must match append order exactly (37 columns). */
var SHEET_HEADERS = [
  "Created At",
  "Created By",
  "Company",
  "Contact",
  "Title",
  "Email",
  "Phone",
  "Website",
  "Business Address",
  "Business Types",
  "Business Type Other",
  "Product Category",
  "Avg SKU Count",
  "Hazardous or Regulated",
  "Special Handling Required",
  "Special Handling Explain",
  "Est Monthly Orders",
  "Avg Units Per Order",
  "Peak Season Months",
  "Origin Country",
  "Shipment Frequency",
  "Container Sizes",
  "Customs Coordination",
  "Fulfillment",
  "Sales Channels",
  "Sales Channel Other",
  "Need System Integration",
  "Est Pallet Positions",
  "Special Storage",
  "Preferred Carriers",
  "Need Shipping Rate Optimization",
  "Additional Requirements",
  "Timeline",
  "Volume",
  "Status",
  "Notes",
  "Files",
];

var WIDE_COL_COUNT = 37;
/** 0-based Status column index in wide layout (column AJ = 1-based 36) */
var STATUS_IDX_WIDE = 34;

function doGet() {
  return ContentService.createTextOutput(
    "Style Asia 3PL webhook is running. Submissions use POST from the intake app — not this browser link."
  ).setMimeType(ContentService.MimeType.TEXT);
}

function splitPipe_(s) {
  if (!s) return [];
  return String(s)
    .split(" | ")
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
}

function join_(arr) {
  return (arr || []).map(function (x) {
    return String(x);
  }).join(" | ");
}

function padRow_(row, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(i < row.length ? row[i] : "");
  }
  return out;
}

/** 1-based column index of "Status" in row 1; fallback J=10 for legacy 12-col */
function findStatusColumn1Based_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim().toLowerCase() === "status") return c + 1;
  }
  return lastCol >= 20 ? STATUS_IDX_WIDE + 1 : 10;
}

function isLegacy12Sheet_(sheet) {
  if (sheet.getLastRow() < 1) return false;
  var lc = sheet.getLastColumn();
  if (lc > 16) return false;
  var lastHeader = String(sheet.getRange(1, Math.min(lc, 12)).getValue() || "").toLowerCase();
  return lastHeader.indexOf("file") >= 0;
}

function fileListFromCell_(filesStr, r) {
  var fileNames = filesStr ? String(filesStr).split(" | ").map(function (s) { return s.trim(); }).filter(Boolean) : [];
  return fileNames.map(function (name, i) {
    return { id: "sheet-r" + r + "-f" + i, name: name, size: "—", type: "file", url: null };
  });
}

/** Build listLeads JSON object from wide row (0-based indices) */
function parseIsAdmin_(cell) {
  if (cell === true) return true;
  var s = String(cell === 0 ? "0" : cell || "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "admin" || s === "y";
}

/** Sheet tab by name, case-insensitive (Google's getSheetByName is case-sensitive). */
function findSheetByNameCI_(ss, wantName) {
  var want = String(wantName).trim().toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getName()).trim().toLowerCase() === want) return sheets[i];
  }
  return null;
}

/** Create Staff tab with standard headers if missing. */
function ensureStaffSheet_(ss) {
  var sh = findSheetByNameCI_(ss, "Staff");
  if (sh) return sh;
  sh = ss.insertSheet("Staff");
  sh.getRange(1, 1, 1, 4).setValues([["Email", "Password", "Name", "IsAdmin"]]);
  return sh;
}

/** First matching header row in first 25 rows, or null. */
function getStaffSheetLayoutFromSheet_(staffSheet) {
  var lastR = staffSheet.getLastRow();
  var lastC = Math.max(staffSheet.getLastColumn(), 1);
  if (lastR < 1) return null;
  var svals = staffSheet.getRange(1, 1, lastR, lastC).getValues();
  for (var hi = 0; hi < Math.min(svals.length, 25); hi++) {
    var tryCols = findStaffColumns_(svals[hi]);
    if (tryCols.colEmail >= 0 && tryCols.colPass >= 0) {
      return { sheet: staffSheet, headerRowIdx: hi, cols: tryCols, svals: svals };
    }
  }
  return null;
}

function upsertStaffUserInSheet_(ss, email, password, name, isAdmin) {
  var staffSheet = ensureStaffSheet_(ss);
  var layout = getStaffSheetLayoutFromSheet_(staffSheet);
  if (!layout) {
    throw new Error(
      "Staff tab needs a header row with Email and Password columns. New tabs get standard headers automatically — redeploy after creating Staff."
    );
  }
  var cols = layout.cols;
  var hdr = layout.headerRowIdx;
  var svals = layout.svals;
  var sheet = layout.sheet;
  var emailNorm = String(email).trim().toLowerCase();
  for (var r = hdr + 1; r < svals.length; r++) {
    var er = String(svals[r][cols.colEmail] || "").trim().toLowerCase();
    if (er === emailNorm) {
      var r1 = r + 1;
      sheet.getRange(r1, cols.colEmail + 1).setValue(String(email).trim());
      sheet.getRange(r1, cols.colPass + 1).setValue(String(password));
      if (cols.colName >= 0) sheet.getRange(r1, cols.colName + 1).setValue(String(name || email));
      if (cols.colAdmin >= 0) sheet.getRange(r1, cols.colAdmin + 1).setValue(isAdmin ? "yes" : "no");
      return;
    }
  }
  var lc = Math.max(sheet.getLastColumn(), cols.colEmail + 1, cols.colPass + 1);
  if (cols.colName >= 0) lc = Math.max(lc, cols.colName + 1);
  if (cols.colAdmin >= 0) lc = Math.max(lc, cols.colAdmin + 1);
  var newRow = [];
  for (var i = 0; i < lc; i++) newRow.push("");
  newRow[cols.colEmail] = String(email).trim();
  newRow[cols.colPass] = String(password);
  if (cols.colName >= 0 && cols.colName < lc) newRow[cols.colName] = String(name || email);
  if (cols.colAdmin >= 0 && cols.colAdmin < lc) newRow[cols.colAdmin] = isAdmin ? "yes" : "no";
  sheet.appendRow(newRow);
}

function removeStaffUserFromSheet_(ss, email) {
  var staffSheet = findSheetByNameCI_(ss, "Staff");
  if (!staffSheet) return;
  var layout = getStaffSheetLayoutFromSheet_(staffSheet);
  if (!layout) return;
  var cols = layout.cols;
  var hdr = layout.headerRowIdx;
  var svals = layout.svals;
  var emailNorm = String(email).trim().toLowerCase();
  for (var r = hdr + 1; r < svals.length; r++) {
    var er = String(svals[r][cols.colEmail] || "").trim().toLowerCase();
    if (er === emailNorm) {
      layout.sheet.deleteRow(r + 1);
      return;
    }
  }
}

/** Find Staff sheet column indices from header row (flexible column order). */
function findStaffColumns_(headerRow) {
  var colEmail = -1;
  var colPass = -1;
  var colName = -1;
  var colAdmin = -1;
  for (var c = 0; c < headerRow.length; c++) {
    var hc = String(headerRow[c]).trim().toLowerCase();
    if (hc === "email" || hc === "e-mail" || hc === "login email" || hc === "login" || hc === "user email") {
      if (colEmail < 0) colEmail = c;
    } else if (hc === "password" || hc === "pass" || hc === "pwd") {
      if (colPass < 0) colPass = c;
    } else if (hc === "name" || hc === "display name" || hc === "full name") {
      if (colName < 0) colName = c;
    } else if (hc === "isadmin" || hc === "admin" || hc === "role") {
      if (colAdmin < 0) colAdmin = c;
    }
  }
  return { colEmail: colEmail, colPass: colPass, colName: colName, colAdmin: colAdmin };
}

function wideRowToLead_(row37, r) {
  var row = padRow_(row37, WIDE_COL_COUNT);
  var status = String(row[STATUS_IDX_WIDE] || "New");
  if (["New", "Quoted", "Onboarding", "Active"].indexOf(status) === -1) status = "New";
  var fulfill = splitPipe_(row[23]);

  return {
    rowIndex: r + 1,
    createdAt: String(row[0] || ""),
    createdBy: String(row[1] || ""),
    companyName: String(row[2] || ""),
    contactName: String(row[3] || ""),
    title: String(row[4] || ""),
    email: String(row[5] || ""),
    phone: String(row[6] || ""),
    website: String(row[7] || ""),
    businessAddress: String(row[8] || ""),
    businessTypes: splitPipe_(row[9]),
    businessTypeOther: String(row[10] || ""),
    productCategory: String(row[11] || ""),
    averageSkuCount: String(row[12] || ""),
    hazardousItems: String(row[13] || ""),
    specialHandlingRequired: String(row[14] || ""),
    specialHandlingExplain: String(row[15] || ""),
    estimatedMonthlyOrders: String(row[16] || ""),
    averageUnitsPerOrder: String(row[17] || ""),
    peakSeasonMonths: String(row[18] || ""),
    originCountry: String(row[19] || ""),
    shipmentFrequency: String(row[20] || ""),
    containerSizes: splitPipe_(row[21]),
    customsCoordination: String(row[22] || ""),
    fulfillmentOptions: fulfill,
    salesChannels: splitPipe_(row[24]),
    salesChannelOther: String(row[25] || ""),
    needSystemIntegration: String(row[26] || ""),
    estimatedPalletPositions: String(row[27] || ""),
    specialStorage: String(row[28] || ""),
    preferredCarriers: String(row[29] || ""),
    needShippingRateOptimization: String(row[30] || ""),
    additionalRequirements: String(row[31] || ""),
    timeline: String(row[32] || ""),
    volume: String(row[33] || ""),
    status: status,
    notes: String(row[35] || ""),
    services: fulfill,
    files: fileListFromCell_(row[36], r),
  };
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === "validateStaffLogin") {
      var loginEmail = String(data.email || "").trim().toLowerCase();
      var loginPass = String(data.password || "");
      if (!loginEmail || loginPass === "") {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: "Missing email or password" })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: false,
            error:
              "Apps Script has no active spreadsheet. Create the script from Extensions → Apps Script inside your Sheet (container-bound), or set SPREADSHEET_ID in Script properties and use openById.",
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var staffSheet = findSheetByNameCI_(ss, "Staff");
      if (!staffSheet) {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: false,
            error:
              'No tab named "Staff" (any casing). Add a sheet tab named Staff with row 1 headers: Email, Password, Name, IsAdmin.',
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var lastR = staffSheet.getLastRow();
      var lastC = Math.max(staffSheet.getLastColumn(), 1);
      if (lastR < 1) {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: false,
            error:
              "Staff tab is empty. Add headers (Email, Password, …) and at least one user row with both cells filled.",
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var svals = staffSheet.getRange(1, 1, lastR, lastC).getValues();
      var headerRowIdx = -1;
      var cols = null;
      var scanMax = Math.min(svals.length, 25);
      for (var hi = 0; hi < scanMax; hi++) {
        var tryCols = findStaffColumns_(svals[hi]);
        if (tryCols.colEmail >= 0 && tryCols.colPass >= 0) {
          headerRowIdx = hi;
          cols = tryCols;
          break;
        }
      }
      if (headerRowIdx < 0 || !cols) {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: false,
            error:
              "Staff tab: in the first rows, include a header row with Email (or E-mail / Login) and Password columns. Optional: Name, IsAdmin. You can put a title on row 1 and headers on row 2.",
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var hasDataRow = false;
      for (var dr = headerRowIdx + 1; dr < svals.length; dr++) {
        var drow = svals[dr];
        var dem = String(drow[cols.colEmail] || "").trim();
        var dpw = String(drow[cols.colPass] || "");
        if (dem && dpw) hasDataRow = true;
      }
      if (!hasDataRow) {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: false,
            error:
              "Staff tab: headers found, but no row below them has both Email and Password filled. Add row(s): col Email = login email, col Password = exact password (same row).",
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      for (var sr = headerRowIdx + 1; sr < svals.length; sr++) {
        var srow = svals[sr];
        var rowEmail = String(srow[cols.colEmail] || "").trim().toLowerCase();
        var rowPass = String(srow[cols.colPass] || "");
        if (rowEmail === loginEmail && rowPass === loginPass) {
          var dispName = cols.colName >= 0 ? String(srow[cols.colName] || "").trim() : "";
          if (!dispName) dispName = loginEmail;
          var isAd = cols.colAdmin >= 0 ? parseIsAdmin_(srow[cols.colAdmin]) : false;
          var outEmail = String(srow[cols.colEmail] || "").trim().toLowerCase();
          return ContentService.createTextOutput(
            JSON.stringify({ ok: true, email: outEmail, name: dispName, isAdmin: isAd })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: "Invalid email or password" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "upsertStaffUser") {
      var uEmail = String(data.email || "").trim();
      var uPass = String(data.password || "");
      var uName = String(data.name || "").trim();
      var uAdmin = data.isAdmin === true;
      if (!uEmail || uPass === "") {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: "email and password are required" })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var ssUpsert = SpreadsheetApp.getActiveSpreadsheet();
      if (!ssUpsert) {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: "No active spreadsheet (bind script to the Sheet)." })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      try {
        upsertStaffUserInSheet_(ssUpsert, uEmail, uPass, uName || uEmail, uAdmin);
      } catch (errUpsert) {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: String(errUpsert) })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "removeStaffUser") {
      var remEmail = String(data.email || "").trim();
      if (!remEmail) {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: "email is required" })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var ssRem = SpreadsheetApp.getActiveSpreadsheet();
      if (!ssRem) {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: "No active spreadsheet (bind script to the Sheet)." })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      try {
        removeStaffUserFromSheet_(ssRem, remEmail);
      } catch (errRem) {
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, error: String(errRem) })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "listLeads") {
      var listSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
      if (!listSheet || listSheet.getLastRow() < 2) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true, leads: [] })).setMimeType(
          ContentService.MimeType.JSON
        );
      }
      var values = listSheet.getDataRange().getValues();
      var leads = [];
      var legacy = isLegacy12Sheet_(listSheet);

      for (var r = 1; r < values.length; r++) {
        var row = values[r];
        if (legacy) {
          var services = splitPipe_(row[6] || "");
          var statusL = String(row[9] || "New");
          if (["New", "Quoted", "Onboarding", "Active"].indexOf(statusL) === -1) statusL = "New";
          leads.push({
            rowIndex: r + 1,
            createdAt: String(row[0] || ""),
            createdBy: String(row[1] || ""),
            companyName: String(row[2] || ""),
            contactName: String(row[3] || ""),
            email: String(row[4] || ""),
            phone: String(row[5] || ""),
            title: "",
            website: "",
            businessAddress: "",
            businessTypes: [],
            businessTypeOther: "",
            productCategory: "",
            averageSkuCount: "",
            hazardousItems: "",
            specialHandlingRequired: "",
            specialHandlingExplain: "",
            estimatedMonthlyOrders: "",
            averageUnitsPerOrder: "",
            peakSeasonMonths: "",
            originCountry: "",
            shipmentFrequency: "",
            containerSizes: [],
            customsCoordination: "",
            fulfillmentOptions: services,
            salesChannels: [],
            salesChannelOther: "",
            needSystemIntegration: "",
            estimatedPalletPositions: "",
            specialStorage: "",
            preferredCarriers: "",
            needShippingRateOptimization: "",
            additionalRequirements: String(row[10] || ""),
            services: services,
            volume: String(row[7] || ""),
            timeline: String(row[8] || ""),
            notes: String(row[10] || ""),
            status: statusL,
            files: fileListFromCell_(row[11], r),
          });
        } else {
          leads.push(wideRowToLead_(row, r));
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, leads: leads })).setMimeType(
        ContentService.MimeType.JSON
      );
    }

    if (data.action === "updateLeadStatus") {
      var uRow = parseInt(data.rowIndex, 10);
      var uStatus = String(data.status || "");
      if (["New", "Quoted", "Onboarding", "Active"].indexOf(uStatus) === -1) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Invalid status" })).setMimeType(
          ContentService.MimeType.JSON
        );
      }
      var uSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
      if (!uSheet || uRow < 2 || uRow > uSheet.getLastRow()) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Invalid row" })).setMimeType(
          ContentService.MimeType.JSON
        );
      }
      var statusCol = findStatusColumn1Based_(uSheet);
      uSheet.getRange(uRow, statusCol).setValue(uStatus);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    var lead = data.lead || {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
    if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Leads");

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    }

    var fulfill = lead.fulfillmentOptions && lead.fulfillmentOptions.length ? lead.fulfillmentOptions : lead.services;

    var rowVals = [
      lead.createdAt || "",
      lead.createdBy || "",
      lead.companyName || "",
      lead.contactName || "",
      lead.title || "",
      lead.email || "",
      lead.phone || "",
      lead.website || "",
      lead.businessAddress || "",
      join_(lead.businessTypes),
      lead.businessTypeOther || "",
      lead.productCategory || "",
      lead.averageSkuCount || "",
      lead.hazardousItems || "",
      lead.specialHandlingRequired || "",
      lead.specialHandlingExplain || "",
      lead.estimatedMonthlyOrders || "",
      lead.averageUnitsPerOrder || "",
      lead.peakSeasonMonths || "",
      lead.originCountry || "",
      lead.shipmentFrequency || "",
      join_(lead.containerSizes),
      lead.customsCoordination || "",
      join_(fulfill),
      join_(lead.salesChannels),
      lead.salesChannelOther || "",
      lead.needSystemIntegration || "",
      lead.estimatedPalletPositions || "",
      lead.specialStorage || "",
      lead.preferredCarriers || "",
      lead.needShippingRateOptimization || "",
      lead.additionalRequirements || "",
      lead.timeline || "",
      lead.volume || "",
      lead.status || "New",
      lead.notes || "",
      (lead.files || []).map(function (f) { return f.name; }).join(" | "),
    ];

    sheet.appendRow(rowVals);
    var appendedRow = sheet.getLastRow();

    var cc = data.customerConfirmation;
    if (cc && cc.send && cc.to) {
      var name = cc.contactName || "there";
      var subject = "We received your inquiry — Style Asia 3PL";
      var body =
        "Hi " + name + ",\n\n" +
        "Thanks for contacting Style Asia 3PL. We've received your client onboarding submission and will get back to you soon.\n\n" +
        (cc.companyName ? "Company: " + cc.companyName + "\n\n" : "") +
        "— Style Asia 3PL Logistics";

      MailApp.sendEmail({
        to: cc.to,
        subject: subject,
        body: body,
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, sheetRow: appendedRow })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(
      ContentService.MimeType.JSON
    );
  }
}
