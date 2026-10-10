"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { getLocalTodayDateString, formatForDisplay, formatFileDate } from '@/lib/date';
import { playSuccessSound, playErrorSound } from '@/lib/sound';
import { exportToExcel, importFromExcel } from '@/lib/excel';
import { DayData, AppSettings, ScanEntry, DuplicateAttempt } from '@/types';
import { Calendar, Download, Upload, Plus, AlertCircle, FileSpreadsheet, ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react';
import ExcelSheetView from '@/components/ExcelSheetView';
import { getSettingsDB, saveSettingsDB, getDayDataDB, saveDayDataDB, migrateLocalStorageToIDB, getAllDatesWithCounts, getBarcodeInLastNDays } from '@/lib/idb';
import { DEFAULT_HEADERS } from '@/lib/storage';
import { useSearchParams } from 'next/navigation';

function DispatchScannerApp() {
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const urlDate = searchParams?.get('date');
  
  const [todayStr, setTodayStr] = useState('');
  const [date, setDate] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  const [settings, setSettings] = useState<AppSettings>({ headers: DEFAULT_HEADERS, activeHeader: DEFAULT_HEADERS[0] });
  const [dayData, setDayData] = useState<DayData>({ date: '', entries: [], duplicateAttempts: [] });
  const [savedDates, setSavedDates] = useState<{date: string, count: number}[]>([]);
  
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', title: string, text: string } | null>(null);
  const [recentScanId, setRecentScanId] = useState<string>('');
  const [duplicateFlashId, setDuplicateFlashId] = useState<string>('');
  
  const [showAddHeader, setShowAddHeader] = useState(false);
  const [newHeaderName, setNewHeaderName] = useState('');
  const [showImportModal, setShowImportModal] = useState<{ file: File, headers: string[], entries: any[] } | null>(null);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  const refocusInput = () => {
    if (!isReadOnly && document.activeElement?.tagName !== 'INPUT') {
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const loadDateData = async (d: string) => {
    const data = await getDayDataDB(d);
    setDayData(data);
    setDate(d);
    const today = getLocalTodayDateString();
    setIsReadOnly(d !== today);
    const windowUrl = new URL(window.location.href);
    windowUrl.searchParams.set('date', d);
    window.history.replaceState({}, '', windowUrl.toString());
  };

  const refreshDatesList = async () => {
    const list = await getAllDatesWithCounts();
    setSavedDates(list);
  };

  useEffect(() => {
    async function init() {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
      await migrateLocalStorageToIDB();
      
      const s = await getSettingsDB();
      setSettings(s);
      
      const today = getLocalTodayDateString();
      setTodayStr(today);
      const initialDate = urlDate || today;
      await loadDateData(initialDate);
      await refreshDatesList();
      
      setMounted(true);
    }
    init();
  }, []);
  
  useEffect(() => {
    if (mounted) window.addEventListener('click', refocusInput);
    return () => window.removeEventListener('click', refocusInput);
  }, [mounted, isReadOnly]);
  
  useEffect(() => {
    if (mounted) saveSettingsDB(settings);
  }, [settings, mounted]);
  
  useEffect(() => {
    if (mounted && dayData.date) {
      saveDayDataDB(dayData).then(() => refreshDatesList());
    }
  }, [dayData, mounted]);
  
  useEffect(() => {
    if (!showAddHeader && !showImportModal && !showDuplicatesModal) refocusInput();
  }, [showAddHeader, showImportModal, showDuplicatesModal]);
  
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    const barcode = inputValue.trim();
    if (!barcode) return;
    
    if (todayStr !== date) {
      alert("You are not on today's sheet!");
      return;
    }
    
    const existingToday = dayData.entries.find(entry => entry.barcode.toLowerCase() === barcode.toLowerCase());
    if (existingToday) {
      playErrorSound();
      const newAttempt: DuplicateAttempt = {
        id: Math.random().toString(36).substring(2, 9),
        barcode,
        attemptedColumn: settings.activeHeader,
        existingColumn: existingToday.column,
        existingRow: 0,
        time: new Date().toISOString()
      };
      setDayData(prev => ({ ...prev, duplicateAttempts: [newAttempt, ...prev.duplicateAttempts] }));
      setDuplicateFlashId(existingToday.id);
      setTimeout(() => setDuplicateFlashId(''), 2000);
      setStatusMsg({ type: 'error', title: 'Duplicate Data', text: `Barcode "${barcode}" exists in ${existingToday.column}.` });
      setInputValue('');
      setTimeout(() => setStatusMsg(null), 4000);
      return;
    }

    const pastDuplicate = await getBarcodeInLastNDays(barcode, 7, todayStr);
    if (pastDuplicate) {
      playErrorSound();
      setStatusMsg({ type: 'error', title: 'Duplicate Data (Past)', text: `Barcode exists in ${pastDuplicate.column} on ${pastDuplicate.date}.` });
      setInputValue('');
      setTimeout(() => setStatusMsg(null), 4000);
      return;
    }
    
    playSuccessSound();
    const newEntry: ScanEntry = {
      id: Math.random().toString(36).substring(2, 9),
      barcode,
      column: settings.activeHeader,
      scannedAt: new Date().toISOString(),
      source: "Scanned"
    };
    
    setDayData(prev => ({ ...prev, entries: [newEntry, ...prev.entries] }));
    setRecentScanId(newEntry.id);
    setTimeout(() => setRecentScanId(''), 2000);
    setStatusMsg({ type: 'success', title: 'Scanned Successfully', text: `${barcode} added.` });
    setInputValue('');
    setTimeout(() => setStatusMsg(null), 1500);
  };
  
  const handleExport = async () => {
    try {
      const writtenCount = await exportToExcel(dayData, settings);
      alert(`Exported ${writtenCount} barcodes to Dispatch_${formatFileDate(dayData.date)}.xlsx successfully.`);
    } catch (e: any) {
      alert("Export failed: " + e.message);
    }
  };

  const handleImportSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const { headers, entries } = await importFromExcel(file);
        setShowImportModal({ file, headers, entries });
      } catch (err: any) {
        alert("Failed to import: " + err.message);
      }
    }
    e.target.value = '';
  };

  const executeImport = (mode: 'replace' | 'merge') => {
    if (!showImportModal) return;
    const { headers: importedHeaders, entries } = showImportModal;
    const newHeaders = [...settings.headers];
    importedHeaders.forEach(h => {
      if (!newHeaders.includes(h)) newHeaders.push(h);
    });
    setSettings(prev => ({ ...prev, headers: newHeaders }));
    
    let skipped = 0, added = 0;
    setDayData(prev => {
      const baseEntries = mode === 'replace' ? [] : [...prev.entries];
      const existingBarcodes = new Set(baseEntries.map(e => e.barcode.toLowerCase()));
      const newEntries = [...baseEntries];
      
      entries.forEach(entry => {
        if (existingBarcodes.has(entry.barcode.toLowerCase())) skipped++;
        else { added++; newEntries.push(entry); existingBarcodes.add(entry.barcode.toLowerCase()); }
      });
      return { ...prev, entries: newEntries, duplicateAttempts: mode === 'replace' ? [] : prev.duplicateAttempts };
    });
    alert(`Loaded ${added} barcodes. ${skipped} duplicates skipped.`);
    setShowImportModal(null);
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    loadDateData(d.toISOString().split('T')[0]);
  };
  
  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    loadDateData(d.toISOString().split('T')[0]);
  };

  if (!mounted) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <header className="bg-slate-900 text-white p-4 flex flex-wrap gap-4 items-center justify-between shadow-md z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-wider">DISPATCH SCANNER</h1>
          <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-md">
            <button onClick={handlePrevDay} className="hover:text-blue-400 p-1"><ChevronLeft className="w-4 h-4"/></button>
            <input type="date" className="bg-transparent text-sm font-medium border-none outline-none text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" value={date} onChange={(e) => loadDateData(e.target.value)} />
            <button onClick={handleNextDay} className="hover:text-blue-400 p-1"><ChevronRight className="w-4 h-4"/></button>
            <button onClick={() => loadDateData(todayStr)} className="ml-2 px-2 py-1 bg-slate-700 text-xs rounded hover:bg-slate-600">Today</button>
          </div>
          
          <select 
            className="bg-slate-800 text-sm text-white px-3 py-2 rounded-md outline-none"
            value={date}
            onChange={(e) => loadDateData(e.target.value)}
          >
            <option value="" disabled>Saved dates...</option>
            {savedDates.map(sd => (
              <option key={sd.date} value={sd.date}>{sd.date} — {sd.count} scans</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => setShowDuplicatesModal(true)} className={`px-3 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 transition-colors ${dayData.duplicateAttempts.length > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'}`}>
            <AlertCircle className="w-4 h-4" /><span>Duplicates ({dayData.duplicateAttempts.length})</span>
          </button>
          <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2">
            <Upload className="w-4 h-4" /><span>Open Excel</span>
            <input type="file" accept=".xlsx" className="hidden" onChange={handleImportSelect} />
          </label>
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 shadow-sm shadow-green-900/20">
            <Download className="w-4 h-4" /><span>Export</span>
          </button>
        </div>
      </header>

      {isReadOnly && (
        <div className="bg-yellow-100 text-yellow-800 px-6 py-2 flex justify-between items-center text-sm font-semibold shadow-sm">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4" />
            <span>Viewing {formatFileDate(date)} (read-only). Go to Today to scan.</span>
          </div>
          <div className="flex space-x-3">
            <button onClick={() => { if(confirm("Enable edits for this past date?")) setIsReadOnly(false); }} className="text-yellow-900 underline">Enable editing</button>
            <button onClick={() => loadDateData(todayStr)} className="bg-yellow-800 text-yellow-100 px-3 py-1 rounded">Back to Today</button>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 flex flex-col gap-6 w-full max-w-full overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-6 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 xl:w-2/3 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg border border-blue-200">
                  <span className="text-xs uppercase font-bold text-blue-500 block">Totals for {formatFileDate(date)}</span>
                  <span className="text-xl font-bold">Total Scanned: {dayData.entries.length}</span>
                </div>
                <div className="bg-orange-50 text-orange-800 px-4 py-2 rounded-lg border border-orange-200">
                   <span className="text-xs uppercase font-bold text-orange-500 block">Duplicates Blocked</span>
                   <span className="text-xl font-bold">{dayData.duplicateAttempts.length}</span>
                </div>
              </div>
              <button onClick={() => setShowAddHeader(true)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 text-sm font-semibold rounded flex items-center">
                <Plus className="w-4 h-4 mr-1" /> Add Header
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 flex-wrap">
              {settings.headers.map((header, idx) => {
                const isActive = settings.activeHeader === header;
                const count = dayData.entries.filter(e => e.column === header).length;
                return (
                  <button key={header} onClick={() => setSettings(s => ({ ...s, activeHeader: header }))} className={`relative px-4 py-3 rounded-lg border-2 text-left transition-all min-w-[140px] flex-1 ${isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                    <div className="font-bold mb-1 text-slate-700">{header}</div>
                    <div className="text-sm font-semibold text-slate-500">{count} items</div>
                    {idx < 9 && <div className="absolute top-2 right-2 w-5 h-5 bg-slate-200 text-slate-500 text-[10px] rounded flex items-center justify-center font-bold">{idx + 1}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 xl:w-1/3 flex flex-col justify-center">
            <form onSubmit={handleScan} className="relative">
              <input ref={inputRef} disabled={isReadOnly} type="text" className="w-full text-3xl font-mono p-4 border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none disabled:bg-slate-100 disabled:text-slate-400" placeholder={isReadOnly ? "Read Only Mode" : "Scan barcode..."} value={inputValue} onChange={(e) => setInputValue(e.target.value)} autoFocus />
            </form>
            <div className="mt-4 h-16">
              {statusMsg && (
                <div className={`p-3 rounded-lg flex items-start space-x-3 h-full overflow-hidden ${statusMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800 border-2 border-red-200'}`}>
                  <div><h3 className="font-bold text-sm leading-tight">{statusMsg.title}</h3><p className="text-xs mt-0.5 truncate">{statusMsg.text}</p></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {dayData.entries.length === 0 ? (
           <div className="flex-1 flex items-center justify-center bg-white border border-slate-300 rounded-lg shadow-sm">
             <div className="text-center text-slate-500">
               <FileSpreadsheet className="w-16 h-16 mx-auto text-slate-300 mb-4" />
               <p className="font-bold text-lg">No scans on {formatFileDate(date)}</p>
             </div>
           </div>
        ) : (
          <ExcelSheetView 
            date={formatFileDate(date)}
            entries={dayData.entries}
            settings={settings}
            recentScanId={recentScanId}
            duplicateFlashId={duplicateFlashId}
            onDelete={(id) => !isReadOnly && setDayData(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== id) }))}
            onRefocusInput={refocusInput}
          />
        )}
      </main>
      
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">How would you like to process this file?</h3>
            <div className="space-y-3">
              <button onClick={() => executeImport('replace')} className="w-full text-left p-4 rounded-lg border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50">
                <div className="font-bold text-slate-800">Continue this file</div>
              </button>
              <button onClick={() => executeImport('merge')} className="w-full text-left p-4 rounded-lg border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50">
                <div className="font-bold text-slate-800">Merge into today</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DispatchScannerApp />
    </Suspense>
  );
}
