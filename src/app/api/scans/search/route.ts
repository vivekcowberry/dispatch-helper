import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScanExcelLocation } from "@/lib/excel-location";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawBarcode = searchParams.get('barcode');

  if (!rawBarcode || !rawBarcode.trim()) {
    return NextResponse.json({ error: "BARCODE_REQUIRED" }, { status: 400 });
  }

  const barcode = rawBarcode.trim();
  const barcodeNormalized = barcode.toUpperCase();

  try {
    // 1. Search across the entire database for any active historical scan
    const scan = await prisma.scan.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { barcode },
          { barcodeNormalized },
        ],
      },
      include: {
        company: true,
      },
      orderBy: { scannedAt: 'asc' },
    });

    if (!scan) {
      return NextResponse.json({
        found: false,
        barcode,
      });
    }

    // 2. Resolve exact Excel file, worksheet, and cell location
    const location = await resolveScanExcelLocation(scan);

    return NextResponse.json({
      found: true,
      scan: {
        id: scan.id,
        barcode: scan.barcode,
        companyId: scan.company.name,
        column: scan.company.name,
        dispatchDate: scan.dispatchDate,
        scannedAt: scan.scannedAt.toISOString(),
        status: scan.status || "DISPATCHED",
        excelFileName: location.excelFileName,
        sheetName: location.sheetName,
        cellAddress: location.cellAddress,
        colLetter: location.colLetter,
        sheetRow: location.sheetRow,
        gridRow: location.gridRow,
        location,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
