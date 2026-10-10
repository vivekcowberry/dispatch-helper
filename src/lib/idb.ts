import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ScanEntry, AppSettings, DuplicateAttempt, DayData } from '../types';
import { DEFAULT_HEADERS } from './storage'; // for fallback

interface DispatchDB extends DBSchema {
  entries: {
    key: string; // entry id
    value: ScanEntry & { date: string }; 
    indexes: {
      'by-date': string;
      'by-barcode': string;
    };
  };
  duplicates: {
    key: string;
    value: DuplicateAttempt & { date: string };
    indexes: {
      'by-date': string;
    };
  };
  settings: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<DispatchDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<DispatchDB>('dispatch-scanner-db', 1, {
      upgrade(db) {
        const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
        entryStore.createIndex('by-date', 'date');
        entryStore.createIndex('by-barcode', 'barcode');
        
        const dupStore = db.createObjectStore('duplicates', { keyPath: 'id' });
        dupStore.createIndex('by-date', 'date');
        
        db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export async function getSettingsDB(): Promise<AppSettings> {
  const db = await getDB();
  const settings = await db.get('settings', 'app-settings');
  return settings || { headers: DEFAULT_HEADERS, activeHeader: DEFAULT_HEADERS[0] };
}

export async function saveSettingsDB(settings: AppSettings) {
  const db = await getDB();
  await db.put('settings', settings, 'app-settings');
}

export async function getDayDataDB(date: string): Promise<DayData> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('entries', 'by-date', date);
  const duplicates = await db.getAllFromIndex('duplicates', 'by-date', date);
  return { date, entries, duplicateAttempts: duplicates };
}

export async function saveDayDataDB(dayData: DayData) {
  const db = await getDB();
  const tx = db.transaction(['entries', 'duplicates'], 'readwrite');
  
  // To avoid orphaned data if items were deleted, 
  // normally we'd delete old ones for this date and re-insert, or track deletions.
  // For simplicity, we clear all for this date, then insert.
  const oldEntries = await tx.objectStore('entries').index('by-date').getAllKeys(dayData.date);
  for (const key of oldEntries) await tx.objectStore('entries').delete(key);
  
  const oldDups = await tx.objectStore('duplicates').index('by-date').getAllKeys(dayData.date);
  for (const key of oldDups) await tx.objectStore('duplicates').delete(key);
  
  for (const e of dayData.entries) {
    await tx.objectStore('entries').put({ ...e, date: dayData.date });
  }
  for (const d of dayData.duplicateAttempts) {
    await tx.objectStore('duplicates').put({ ...d, date: dayData.date });
  }
  
  await tx.done;
}

export async function getAllDatesWithCounts(): Promise<{ date: string, count: number }[]> {
  const db = await getDB();
  const allEntries = await db.getAll('entries');
  const dateCounts: Record<string, number> = {};
  allEntries.forEach(e => {
    dateCounts[e.date] = (dateCounts[e.date] || 0) + 1;
  });
  
  return Object.keys(dateCounts)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .map(date => ({ date, count: dateCounts[date] }));
}

export async function getBarcodeInLastNDays(barcode: string, days: number, today: string): Promise<{date: string, column: string, row: number} | null> {
  const db = await getDB();
  const matches = await db.getAllFromIndex('entries', 'by-barcode', barcode);
  
  const todayTime = new Date(today).getTime();
  const cutoffTime = todayTime - (days * 24 * 60 * 60 * 1000);
  
  for (const m of matches) {
    const mTime = new Date(m.date).getTime();
    if (mTime >= cutoffTime) {
       // Estimate row (or return generic)
       return { date: m.date, column: m.column, row: 0 }; // Full row calculation is complex here
    }
  }
  return null;
}

export async function migrateLocalStorageToIDB() {
  try {
    const migrated = localStorage.getItem('idb_migrated');
    if (migrated) return;

    const db = await getDB();
    const settingsStr = localStorage.getItem('dispatch:settings');
    if (settingsStr) {
      await db.put('settings', JSON.parse(settingsStr), 'app-settings');
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dispatch:data:')) {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          const date = parsed.date;
          if (date) {
             const tx = db.transaction(['entries', 'duplicates'], 'readwrite');
             for (const e of parsed.entries || []) {
                await tx.objectStore('entries').put({ ...e, source: e.source || 'Scanned', date });
             }
             for (const d of parsed.duplicateAttempts || []) {
                await tx.objectStore('duplicates').put({ ...d, date });
             }
             await tx.done;
          }
        }
      }
    }
    localStorage.setItem('idb_migrated', 'true');
  } catch(e) {
    console.error("Migration failed", e);
  }
}
