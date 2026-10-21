import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true },
    });

    let headers = companies.map(c => c.name);
    if (headers.length === 0) {
      headers = ["Delhivery", "Amazon", "Instamart", "CRED", "Flipkart", "Blinkit"];
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Dispatch Scanner App";
    workbook.created = new Date();

    // Sheet 1: Data Template (Headers only, matching website columns)
    const sheet = workbook.addWorksheet("Dispatch Import", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Set Company Headers in Row 1
    sheet.getRow(1).values = headers;
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: "FF111827" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEEEEE" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "medium", color: { argb: "FF9CA3AF" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });

    // Set widths and pre-format columns as Text (@) to preserve leading zeros
    headers.forEach((_, index) => {
      const col = sheet.getColumn(index + 1);
      col.width = 22;
      col.numFmt = "@";
    });

    // Pre-format first 1,000 rows as Text (@) so Excel never strips leading zeros
    for (let r = 2; r <= 1000; r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= headers.length; c++) {
        row.getCell(c).numFmt = "@";
      }
    }

    // Sheet 2: Clear Instructions
    const instructionsSheet = workbook.addWorksheet("Instructions");
    instructionsSheet.columns = [
      { header: "Step / Field", key: "field", width: 25 },
      { header: "Instructions", key: "instruction", width: 65 },
    ];

    const instrHeader = instructionsSheet.getRow(1);
    instrHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    instrHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    instrHeader.height = 25;

    instructionsSheet.addRow({
      field: "Excel Structure",
      instruction: "The 'Dispatch Import' worksheet has company headers in Row 1, matching your website.",
    });
    instructionsSheet.addRow({
      field: "Bulk Upload Barcodes",
      instruction: "Simply paste or scan your barcodes directly below each company column (Row 2 onwards).",
    });
    instructionsSheet.addRow({
      field: "Empty Cells",
      instruction: "It is normal for some companies to have fewer barcodes than others; leave unused cells blank.",
    });
    instructionsSheet.addRow({
      field: "Leading Zeros",
      instruction: "All columns are pre-formatted as Text (@) so leading zeros (e.g. 001234567) are preserved.",
    });
    instructionsSheet.addRow({
      field: "Import Date",
      instruction: "Select the target dispatch date in the web application before uploading this file.",
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Dispatch_Import_Template.xlsx"',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "TEMPLATE_GENERATION_FAILED", message: err.message }, { status: 500 });
  }
}
