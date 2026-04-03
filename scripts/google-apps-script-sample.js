/**
 * Google Apps Script for Style Asia 3PL — bound to your Spreadsheet.
 * Deploy → Web app → Execute as: Me, Who has access: Anyone (or your org).
 *
 * FULL COLUMN LAYOUT (37 columns A–AK). Row 1 should match SHEET_HEADERS below — same order as your manual headers:
 *   … Additional Requirements | Timeline | Volume | Status | Notes | Files
 * If you still use a legacy 12-column row, Pull keeps working; new appends use the wide layout.
 *
 * Status column: found by header name "Status" (works after layout changes).
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
