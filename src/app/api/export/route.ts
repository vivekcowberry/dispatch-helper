import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date) return NextResponse.json({ error: "DATE_REQUIRED" }, { status: 400 });

  try {
    // 1. Fetch Companies
    const companies = await prisma.company.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const headers = companies.map(c => c.name);

    // 2. Fetch Scans
    const scans = await prisma.scan.findMany({
      where: { dispatchDate: date, deletedAt: null },
      include: { company: true },
      orderBy: { scannedAt: 'asc' },
    });

    // 3. Fetch Duplicate Attempts for this date
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    const duplicates = await prisma.duplicateAttempt.findMany({
      where: {
        attemptedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        attemptedCompany: true,
        existingScan: { include: { company: true } },
      },
      orderBy: { attemptedAt: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const dateFormatted = date.split('-').reverse().join('-');

    // Configuration: max rows per Dispatch sheet before paging
    const MAX_ROWS_PER_SHEET = 30; // adjust as needed

    // Helper to create a Dispatch worksheet with headers
    const createDispatchSheet = (index: number) => {
      const name = index === 0 ? `Dispatch ${dateFormatted}` : `Dispatch ${dateFormatted} - Part ${index + 1}`;
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.getRow(1).values = headers;
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' },
      };
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      return sheet;
    };

    // Initialize first Dispatch sheet
    let currentSheet = createDispatchSheet(0);
    let currentRowIdx = 2; // start after header
    let sheetIndex = 0;

    const columnsWidths: number[] = headers.map(() => 18);
    const columnData: Record<string, string[]> = {};
    headers.forEach(h => columnData[h] = []);

    scans.forEach(s => {
      const colName = s.company.name;
      if (columnData[colName]) {
        columnData[colName].push(s.barcode);
      }
    });

    const maxRows = Math.max(...headers.map(h => columnData[h].length), 0);

    for (let i = 0; i < maxRows; i++) {
      // If the current sheet exceeds the max rows, start a new sheet
      if (currentRowIdx > MAX_ROWS_PER_SHEET + 1) {
        sheetIndex++;
        currentSheet = createDispatchSheet(sheetIndex);
        currentRowIdx = 2; // reset for new sheet (header is row 1)
      }
      const row = currentSheet.getRow(currentRowIdx);
      headers.forEach((h, colIndex) => {
        const val = columnData[h][i];
        if (val) {
          const cell = row.getCell(colIndex + 1);
          cell.value = val;
          cell.numFmt = '@';
          columnsWidths[colIndex] = Math.max(columnsWidths[colIndex], val.length + 2);
        }
      });
      currentRowIdx++;
    }

    // Apply column widths to all Dispatch sheets created
    workbook.eachSheet((sheet) => {
      if (sheet.name.startsWith('Dispatch')) {
        sheet.columns = columnsWidths.map(w => ({ width: w }));
      }
    });

    // Sheet 2: Summary
    const sheet2 = workbook.addWorksheet('Summary');
    sheet2.getRow(1).values = ['Company', 'Count'];
    sheet2.getRow(1).font = { bold: true };
    let grandTotal = 0;
    headers.forEach((h, i) => {
      const count = columnData[h].length;
      sheet2.getRow(i + 2).values = [h, count];
      grandTotal += count;
    });
    sheet2.getRow(headers.length + 2).values = ['Grand Total', grandTotal];
    sheet2.getRow(headers.length + 2).font = { bold: true };
    sheet2.columns = [{ width: 25 }, { width: 15 }];

    // Sheet 3: Scan Log
    const sheet3 = workbook.addWorksheet('Scan Log');
    sheet3.getRow(1).values = ['S.No', 'Barcode', 'Company', 'Date', 'Time', 'Source', 'Status'];
    sheet3.getRow(1).font = { bold: true };
    scans.forEach((s, i) => {
      const d = new Date(s.scannedAt);
      sheet3.getRow(i + 2).values = [
        i + 1,
        s.barcode,
        s.company.name,
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        s.source,
        s.status || "DISPATCHED",
      ];
      sheet3.getRow(i + 2).getCell(2).numFmt = '@';
    });
    sheet3.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 18 }];

    // Sheet 4: Duplicate Attempts
    if (duplicates.length > 0) {
      const sheet4 = workbook.addWorksheet('Duplicate Attempts');
      sheet4.getRow(1).values = ['S.No', 'Barcode', 'Attempted Company', 'Existing Company', 'Time', 'Status'];
      sheet4.getRow(1).font = { bold: true };
      duplicates.forEach((d, i) => {
        sheet4.getRow(i + 2).values = [
          i + 1,
          d.barcode,
          d.attemptedCompany.name,
          d.existingScan?.company?.name || "Unknown",
          new Date(d.attemptedAt).toLocaleTimeString(),
          d.status || "DETECTED",
        ];
        sheet4.getRow(i + 2).getCell(2).numFmt = '@';
      });
      sheet4.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 18 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Dispatch-${dateFormatted}.xlsx"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}