import prisma from "@/lib/prisma";
import { formatFileDate } from "./date";

export interface ExcelLocation {
  excelFileName: string;
  sheetName: string;
  cellAddress: string;
  colLetter: string;
  sheetRow: number;
  gridRow: number;
  colIndex: number;
  companyName: string;
  companyId: string;
  dispatchDate: string;
}

/**
 * Converts a 0-based column index to an Excel column letter (0 -> A, 1 -> B, etc.)
 */
export function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex + 1;
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
}

/**
 * Resolves the deterministic Excel file, worksheet name, and exact cell address
 * for any scan record based on its company column and scan order on that dispatch date.
 */
export async function resolveScanExcelLocation(
  scan: {
    id: string;
    companyId: string;
    dispatchDate: string;
    scannedAt?: Date | string;
    company?: { id: string; name: string };
  },
  txPrisma = prisma
): Promise<ExcelLocation> {
  // 1. Fetch active companies in order to get the column index
  const companies = await txPrisma.company.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });

  let companyIndex = companies.findIndex(
    c => c.id === scan.companyId || (scan.company && c.name === scan.company.name)
  );

  if (companyIndex === -1) {
    // If not found in active list, check if it exists as inactive or custom
    const fallbackCompany = await txPrisma.company.findFirst({
      where: { OR: [{ id: scan.companyId }, { name: scan.company?.name || '' }] },
    });
    if (fallbackCompany) {
      companyIndex = Math.max(0, companies.length);
    } else {
      companyIndex = 0;
    }
  }

  const colLetter = getColumnLetter(companyIndex);
  const companyName = scan.company?.name || companies[companyIndex]?.name || 'Unknown';

  // 2. Efficiently count preceding scans using database index instead of loading full array into memory
  let scanIndex = 0;
  let scannedAtDate: Date | null = scan.scannedAt ? new Date(scan.scannedAt) : null;

  if (!scannedAtDate) {
    const targetScan = await txPrisma.scan.findUnique({
      where: { id: scan.id },
      select: { scannedAt: true },
    });
    scannedAtDate = targetScan?.scannedAt || null;
  }

  if (scannedAtDate) {
    scanIndex = await txPrisma.scan.count({
      where: {
        dispatchDate: scan.dispatchDate,
        companyId: scan.companyId,
        deletedAt: null,
        OR: [
          { scannedAt: { lt: scannedAtDate } },
          { scannedAt: scannedAtDate, id: { lt: scan.id } },
        ],
      },
    });
  }

  // Matching /api/export paging logic: MAX_ROWS_PER_SHEET = 30
  const MAX_ROWS_PER_SHEET = 30;
  const partIndex = Math.floor(scanIndex / MAX_ROWS_PER_SHEET);
  const dateFormatted = formatFileDate(scan.dispatchDate);

  const sheetName =
    partIndex === 0
      ? `Dispatch ${dateFormatted}`
      : `Dispatch ${dateFormatted} - Part ${partIndex + 1}`;

  const sheetRow = (scanIndex % MAX_ROWS_PER_SHEET) + 2; // header is row 1, data starts row 2
  const gridRow = scanIndex + 2;
  const cellAddress = `${colLetter}${sheetRow}`;
  const excelFileName = `Dispatch-${dateFormatted}.xlsx`;

  return {
    excelFileName,
    sheetName,
    cellAddress,
    colLetter,
    sheetRow,
    gridRow,
    colIndex: companyIndex,
    companyName,
    companyId: scan.companyId,
    dispatchDate: scan.dispatchDate,
  };
}
