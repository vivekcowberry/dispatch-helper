import { DayData, AppSettings } from '../types';

export const DEFAULT_HEADERS = ["Delhivery", "Amazon", "Instamart", "CRED", "Flipkart", "Blinkit"];

export function getSettings(): AppSettings {
  try {
    const data = localStorage.getItem('dispatch:settings');
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(e);
  }
  return { headers: DEFAULT_HEADERS, activeHeader: DEFAULT_HEADERS[0] };
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem('dispatch:settings', JSON.stringify(settings));
  } catch (e) {
    console.error(e);
  }
}

export function getDayData(dateString: string): DayData {
  try {
    const key = `dispatch:data:${dateString}`;
    const data = localStorage.getItem(key);
    if (data) {
      const parsed = JSON.parse(data);
      if (!parsed.duplicateAttempts) parsed.duplicateAttempts = [];
      parsed.entries.forEach((e: any) => {
        if (!e.source) e.source = "Scanned";
      });
      return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return { date: dateString, entries: [], duplicateAttempts: [] };
}

export function saveDayData(dayData: DayData) {
  try {
    const key = `dispatch:data:${dayData.date}`;
    localStorage.setItem(key, JSON.stringify(dayData));
  } catch (e) {
    console.error(e);
  }
}
