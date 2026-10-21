export type ScanEntry = {
  id: string;
  barcode: string;
  column: string;
  scannedAt: string; // ISO
  source: "Scanned" | "Imported";
  status?: "DISPATCHED" | "CANCELLED" | "RTS" | string;
};

export type DuplicateAttempt = {
  id: string;
  barcode: string;
  attemptedColumn: string;
  existingColumn: string;
  existingRow?: number;
  time: string; // ISO
  status?: "CANCELLED" | "RTS" | string;
};

export type DayData = {
  date: string; // YYYY-MM-DD
  entries: ScanEntry[];
  duplicateAttempts: DuplicateAttempt[];
};

export type AppSettings = {
  headers: string[];
  activeHeader: string;
};
