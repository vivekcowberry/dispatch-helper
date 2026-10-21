import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dispatchDate = formData.get("dispatchDate") as string | null;

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED", message: "Please select an Excel file to upload." }, { status: 400 });
    }

    if (!dispatchDate || !/^\d{4}-\d{2}-\d{2}$/.test(dispatchDate)) {
      return NextResponse.json({ error: "DATE_REQUIRED", message: "Valid import date (YYYY-MM-DD) is required." }, { status: 400 });
    }

    // Read buffer
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as any);

    // Prefer "Dispatch Import", "Import Data", "Dispatch", or first worksheet
    let worksheet = workbook.getWorksheet("Dispatch Import") ||
                    workbook.getWorksheet("Import Data") ||
                    workbook.getWorksheet("Dispatch") ||
                    workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 1) {
      return NextResponse.json({
        error: "EMPTY_FILE",
        message: "The uploaded Excel workbook contains no readable worksheet.",
      }, { status: 400 });
    }

    // Read Row 1 Headers
    const headerRow = worksheet.getRow(1);
    const columnHeaders: Array<{ colNumber: number; title: string }> = [];

    headerRow.eachCell((cell, colNumber) => {
      let t = "";
      if (cell.type === ExcelJS.ValueType.Formula) {
        t = cell.result?.toString() || "";
      } else {
        t = cell.text || (cell.value?.toString() || "");
      }
      t = t.trim();
      if (t) {
        columnHeaders.push({ colNumber, title: t });
      }
    });

    if (columnHeaders.length === 0) {
      return NextResponse.json({
        error: "NO_HEADERS",
        message: "No column headers found in Row 1. Row 1 must contain Company names.",
      }, { status: 400 });
    }

    // Check if uploaded file uses Single-Barcode-Column format or Company-Columns format (website layout)
    const hasExplicitBarcodeCol = columnHeaders.some(c => {
      const lower = c.title.toLowerCase();
      return lower === "barcode" || lower === "barcodes" || lower === "tracking" || lower === "awb";
    });

    interface ParsedRow {
      rowNumber: number;
      column: string;
      barcode: string;
      barcodeNormalized: string;
      company: string;
      status: "DISPATCHED" | "CANCELLED" | "RTS" | "RTO";
    }

    interface RowError {
      rowNumber: number;
      column?: string;
      barcode?: string;
      reason: string;
    }

    const validRows: ParsedRow[] = [];
    const errors: RowError[] = [];
    const inFileSeen = new Map<string, { rowNumber: number; company: string }>();
    const inFileDuplicates: Array<{ barcode: string; firstRow: number; duplicateRow: number; column?: string }> = [];

    if (!hasExplicitBarcodeCol) {
      // =========================================================================
      // LAYOUT A: Company-Columns Format (The Website Layout)
      // Headers are Company names in Row 1 (e.g. Delhivery, Amazon, Instamart...)
      // Barcodes are placed below each company column
      // =========================================================================
      const maxRows = worksheet.rowCount;

      for (let r = 2; r <= maxRows; r++) {
        const row = worksheet.getRow(r);

        for (const col of columnHeaders) {
          const companyName = col.title;
          const cell = row.getCell(col.colNumber);

          let raw = "";
          if (cell.type === ExcelJS.ValueType.Formula) {
            raw = cell.result?.toString() || "";
          } else {
            raw = cell.text || (cell.value?.toString() || "");
          }

          const barcode = raw.trim().replace(/[\x00-\x1F\x7F]/g, "");
          if (!barcode) continue; // Unused or empty cell in this company column

          // Filter out obvious instructions or sample strings if any
          if (barcode.toUpperCase().startsWith("SAMPLE") || barcode.toLowerCase().includes("instruction")) {
            errors.push({
              rowNumber: r,
              column: companyName,
              barcode,
              reason: "Example placeholder or instruction text skipped.",
            });
            continue;
          }

          const barcodeNormalized = barcode.toUpperCase();

          // Check duplicate within the uploaded file
          if (inFileSeen.has(barcodeNormalized)) {
            const first = inFileSeen.get(barcodeNormalized)!;
            inFileDuplicates.push({
              barcode,
              firstRow: first.rowNumber,
              duplicateRow: r,
              column: companyName,
            });
            errors.push({
              rowNumber: r,
              column: companyName,
              barcode,
              reason: `Duplicate barcode in file under "${companyName}" (first seen under "${first.company}" at row ${first.rowNumber})`,
            });
            continue;
          }

          inFileSeen.set(barcodeNormalized, { rowNumber: r, company: companyName });
          validRows.push({
            rowNumber: r,
            column: companyName,
            barcode,
            barcodeNormalized,
            company: companyName,
            status: "DISPATCHED",
          });
        }
      }
    } else {
      // =========================================================================
      // LAYOUT B: Standard 2/3 Column Table Format (Barcode | Company | Status)
      // Fallback for backwards compatibility
      // =========================================================================
      let barcodeColIdx = -1;
      let companyColIdx = -1;
      let statusColIdx = -1;

      columnHeaders.forEach(c => {
        const lower = c.title.toLowerCase();
        if (lower === "barcode" || lower === "barcodes" || lower === "tracking" || lower === "awb") {
          barcodeColIdx = c.colNumber;
        } else if (lower === "company" || lower === "channel" || lower === "column" || lower === "courier") {
          companyColIdx = c.colNumber;
        } else if (lower === "status" || lower === "state") {
          statusColIdx = c.colNumber;
        }
      });

      if (barcodeColIdx === -1) barcodeColIdx = 1;
      if (companyColIdx === -1) companyColIdx = 2;
      if (statusColIdx === -1) statusColIdx = 3;

      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const isRowEmpty = !row.values || (Array.isArray(row.values) && row.values.every(v => v === null || v === undefined || String(v).trim() === ""));
        if (isRowEmpty) continue;

        const barcodeCell = row.getCell(barcodeColIdx);
        let rawBarcode = "";
        if (barcodeCell.type === ExcelJS.ValueType.Formula) {
          rawBarcode = barcodeCell.result?.toString() || "";
        } else {
          rawBarcode = barcodeCell.text || (barcodeCell.value?.toString() || "");
        }
        const barcode = rawBarcode.trim().replace(/[\x00-\x1F\x7F]/g, "");

        if (!barcode) {
          errors.push({ rowNumber: r, reason: "Barcode is empty" });
          continue;
        }

        const companyCell = row.getCell(companyColIdx);
        const companyRaw = (companyCell.text || companyCell.value?.toString() || "").trim();
        const company = companyRaw || "Delhivery";

        let status: "DISPATCHED" | "CANCELLED" | "RTS" | "RTO" = "DISPATCHED";
        const statusCell = row.getCell(statusColIdx);
        const statusRaw = (statusCell.text || statusCell.value?.toString() || "").trim().toUpperCase();
        if (statusRaw && ["DISPATCHED", "CANCELLED", "RTS", "RTO"].includes(statusRaw)) {
          status = statusRaw as any;
        }

        const barcodeNormalized = barcode.toUpperCase();
        if (inFileSeen.has(barcodeNormalized)) {
          const first = inFileSeen.get(barcodeNormalized)!;
          inFileDuplicates.push({
            barcode,
            firstRow: first.rowNumber,
            duplicateRow: r,
          });
          errors.push({
            rowNumber: r,
            column: company,
            barcode,
            reason: `Duplicate barcode in file (first seen at row ${first.rowNumber})`,
          });
          continue;
        }

        inFileSeen.set(barcodeNormalized, { rowNumber: r, company });
        validRows.push({
          rowNumber: r,
          column: company,
          barcode,
          barcodeNormalized,
          company,
          status,
        });
      }
    }

    if (validRows.length === 0 && errors.length === 0) {
      return NextResponse.json({
        error: "NO_RECORDS",
        message: "No barcodes found below the company headers. Please add barcodes under the company columns.",
      }, { status: 400 });
    }

    // Check database duplicates across ENTIRE database using a single indexed query
    const uniqueNormalizedBarcodes = validRows.map(r => r.barcodeNormalized);
    const existingDbScans = await prisma.scan.findMany({
      where: {
        barcodeNormalized: { in: uniqueNormalizedBarcodes },
        deletedAt: null,
      },
      select: {
        barcode: true,
        barcodeNormalized: true,
        dispatchDate: true,
        status: true,
        company: { select: { name: true } },
      },
    });

    const dbDuplicateMap = new Map<string, { dispatchDate: string; companyName: string; status: string }>();
    existingDbScans.forEach(s => {
      dbDuplicateMap.set(s.barcodeNormalized, {
        dispatchDate: s.dispatchDate,
        companyName: s.company.name,
        status: s.status || "DISPATCHED",
      });
    });

    const databaseDuplicates: Array<{
      barcode: string;
      rowNumber: number;
      column?: string;
      existingDate: string;
      existingCompany: string;
      existingStatus: string;
    }> = [];

    const eligibleRecords: ParsedRow[] = [];

    validRows.forEach(row => {
      if (dbDuplicateMap.has(row.barcodeNormalized)) {
        const existing = dbDuplicateMap.get(row.barcodeNormalized)!;
        databaseDuplicates.push({
          barcode: row.barcode,
          rowNumber: row.rowNumber,
          column: row.column,
          existingDate: existing.dispatchDate,
          existingCompany: existing.companyName,
          existingStatus: existing.status,
        });
      } else {
        eligibleRecords.push(row);
      }
    });

    const totalFound = validRows.length + errors.length;

    return NextResponse.json({
      success: true,
      dispatchDate,
      detectedLayout: hasExplicitBarcodeCol ? "STANDARD_TABLE" : "COMPANY_COLUMNS",
      detectedCompanies: columnHeaders.map(c => c.title),
      totalRows: totalFound,
      validRowsCount: validRows.length,
      invalidRowsCount: errors.length,
      inFileDuplicatesCount: inFileDuplicates.length,
      databaseDuplicatesCount: databaseDuplicates.length,
      newEligibleCount: eligibleRecords.length,
      databaseDuplicates,
      inFileDuplicates,
      errors,
      eligibleRecords,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "VALIDATION_FAILED", message: err.message }, { status: 500 });
  }
}
