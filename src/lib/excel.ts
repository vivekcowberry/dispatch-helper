import { DayData, AppSettings } from '../types';
import { formatFileDate } from './date';

export async function exportToExcel(dayData: DayData, settings: AppSettings) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const dateStr = formatFileDate(dayData.date);
  
  const sheet1 = workbook.addWorksheet(`Dispatch ${dateStr}`, {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  
  const headers = settings.headers;
  sheet1.getRow(1).values = headers;
  const headerRow = sheet1.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEEEEE' }
  };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  const columnsWidths: number[] = headers.map(() => 18);
  
  const columnData: Record<string, string[]> = {};
  headers.forEach(h => columnData[h] = []);
  
  // Sort entries ascending by scannedAt so earlier scans are lower row numbers
  const sortedEntries = [...dayData.entries].sort(
    (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime()
  );

  sortedEntries.forEach(entry => {
    if (columnData[entry.column]) {
      columnData[entry.column].push(entry.barcode);
    }
  });
  
  const maxRows = Math.max(...headers.map(h => columnData[h].length));
  
  let totalWrittenToSheet1 = 0;
  for (let i = 0; i < maxRows; i++) {
    const row = sheet1.getRow(i + 2);
    headers.forEach((h, index) => {
      const val = columnData[h][i];
      if (val) {
        row.getCell(index + 1).value = val;
        row.getCell(index + 1).numFmt = '@';
        columnsWidths[index] = Math.max(columnsWidths[index], val.length + 2);
        totalWrittenToSheet1++;
      }
    });
  }
  
  if (totalWrittenToSheet1 !== dayData.entries.length) {
    throw new Error(`Data mismatch! Exported ${totalWrittenToSheet1} barcodes, but there are ${dayData.entries.length} entries.`);
  }

  sheet1.columns = columnsWidths.map(w => ({ width: w }));
  
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
  
  const sheet3 = workbook.addWorksheet('Scan Log');
  sheet3.getRow(1).values = ['S.No', 'Barcode', 'Company', 'Date', 'Time', 'Source'];
  sheet3.getRow(1).font = { bold: true };
  sortedEntries.forEach((entry, i) => {
    const dateObj = new Date(entry.scannedAt);
    const dStr = dateObj.toLocaleDateString();
    const tStr = dateObj.toLocaleTimeString();
    sheet3.getRow(i + 2).values = [i + 1, entry.barcode, entry.column, dStr, tStr, entry.source];
    sheet3.getRow(i + 2).getCell(2).numFmt = '@';
  });
  sheet3.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }];
  
  if (dayData.duplicateAttempts.length > 0) {
    const sheet4 = workbook.addWorksheet('Duplicate Attempts');
    sheet4.getRow(1).values = ['S.No', 'Barcode', 'Attempted Column', 'Existing Column', 'Existing Row', 'Time'];
    sheet4.getRow(1).font = { bold: true };
    dayData.duplicateAttempts.forEach((attempt, i) => {
      const dateObj = new Date(attempt.time);
      sheet4.getRow(i + 2).values = [
        i + 1,
        attempt.barcode,
        attempt.attemptedColumn,
        attempt.existingColumn,
        attempt.existingRow,
        `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`
      ];
      sheet4.getRow(i + 2).getCell(2).numFmt = '@';
    });
    sheet4.columns = [{ width: 10 }, { width: 25 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 25 }];
  }
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Dispatch_${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  
  return totalWrittenToSheet1;
}

export async function importFromExcel(file: File): Promise<{ headers: string[], entries: any[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  
  // Find sheet 1 (or starts with Dispatch)
  let sheet1 = workbook.worksheets.find(s => s.name.startsWith('Dispatch'));
  if (!sheet1) sheet1 = workbook.worksheets[0];
  if (!sheet1) throw new Error("Excel file is empty");
  
  const headerRow = sheet1.getRow(1);
  const headers: string[] = [];
  
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = cell.text.trim();
  });
  
  const entries: any[] = [];
  
  // Check if "Scan Log" sheet exists for timestamps
  const scanLogSheet = workbook.getWorksheet('Scan Log');
  const timestamps: Record<string, string> = {};
  if (scanLogSheet) {
    scanLogSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const barcode = row.getCell(2).text.trim();
        const dateStr = row.getCell(4).text.trim();
        const timeStr = row.getCell(5).text.trim();
        if (barcode && dateStr && timeStr) {
          try {
            timestamps[barcode] = new Date(`${dateStr} ${timeStr}`).toISOString();
          } catch (e) {
            // ignore invalid date
          }
        }
      }
    });
  }

  sheet1.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell((cell, colNumber) => {
        let barcode = '';
        if (cell.type === ExcelJS.ValueType.Formula) {
            barcode = (cell.result?.toString() || '').trim();
        } else {
            barcode = cell.text.trim();
        }
        
        const column = headers[colNumber - 1];
        if (barcode && column) {
          entries.push({
            id: Math.random().toString(36).substring(2, 9),
            barcode,
            column,
            scannedAt: timestamps[barcode] || new Date().toISOString(),
            source: "Imported"
          });
        }
      });
    }
  });
  
  return { headers: headers.filter(Boolean), entries };
}
