"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLocalTodayDateString, formatForDisplay, formatFileDate } from '@/lib/date';
import { playSuccessSound, playErrorSound } from '@/lib/sound';
import { ScanEntry, AppSettings } from '@/types';
import { 
  Calendar, Download, Upload, Plus, AlertCircle, FileSpreadsheet, 
  ChevronLeft, ChevronRight, Lock, Unlock, Wifi, WifiOff, Loader2,
  Database, RefreshCw, LogOut, User as UserIcon, Ban, RotateCcw,
  Search, X
} from 'lucide-react';
import ExcelSheetView from '@/components/ExcelSheetView';
import LoginView from '@/components/LoginView';
import DuplicateModal, { DuplicateModalData } from '@/components/DuplicateModal';
import StatusBarcodesModal from '@/components/StatusBarcodesModal';
import { useSearchParams, useRouter } from 'next/navigation';

const DEFAULT_HEADERS = ["Delhivery", "Amazon", "Instamart", "CRED", "Flipkart", "Blinkit"];

function DispatchScannerApp() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Auth State
  const [currentUser, setCurrentUser] = useState<{ username: string; name?: string; role?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Duplicate Modal State
  const [duplicateModalData, setDuplicateModalData] = useState<DuplicateModalData | null>(null);
  const [isMarkingDuplicate, setIsMarkingDuplicate] = useState(false);

  // Status Barcodes Modal (Cancelled / RTO)
  const [statusModalType, setStatusModalType] = useState<'CANCELLED' | 'RTO' | null>(null);

  // Check auth session on load
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setIsAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setCurrentUser(null);
  };
  
  const todayStr = getLocalTodayDateString();
  const urlDate = searchParams?.get('date');
  
  // Initialize date from URL param if present, otherwise today
  const [date, setDate] = useState<string>(urlDate || todayStr);
  const [isPastUnlocked, setIsPastUnlocked] = useState(false);
  
  const [inputValue, setInputValue] = useState('');
  const [activeHeader, setActiveHeader] = useState(DEFAULT_HEADERS[0]);
  const [newColumnName, setNewColumnName] = useState('');
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning', title: string, text: string } | null>(null);
  const [recentScanId, setRecentScanId] = useState<string>('');
  const [duplicateFlashId, setDuplicateFlashId] = useState<string>('');
  const [highlightCellId, setHighlightCellId] = useState<string>('');
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const isPastDate = date !== todayStr;
  const isReadOnly = isPastDate && !isPastUnlocked;

  // Sync state if URL changes (e.g. browser back/forward)
  useEffect(() => {
    if (urlDate && urlDate !== date) {
      setDate(urlDate);
    }
  }, [urlDate]);

  // Clean helper to switch date and keep URL in sync
  const changeDate = (newDate: string) => {
    setDate(newDate);
    setIsPastUnlocked(false);
    router.replace(`?date=${newDate}`, { scroll: false });
  };

  // Clean up any legacy IndexedDB database from browser storage
  useEffect(() => {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      try {
        window.indexedDB.deleteDatabase('dispatch-scanner-db');
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // 1. Fetch Companies
  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await fetch('/api/companies');
      if (!res.ok) return DEFAULT_HEADERS.map(name => ({ id: name, name }));
      return res.json() as Promise<Array<{ id: string; name: string }>>;
    },
    staleTime: 60000,
  });

  const headers = companiesData && companiesData.length > 0 
    ? companiesData.map(c => c.name) 
    : DEFAULT_HEADERS;

  // 2. Fetch Dates with scan counts
  const { data: savedDates = [], refetch: refetchDates } = useQuery({
    queryKey: ['savedDates'],
    queryFn: async () => {
      const res = await fetch('/api/dates');
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ date: string; count: number }>>;
    },
    staleTime: 5000,
  });

  // 3. Fetch Scans for active date directly from PostgreSQL
  const { data: scans = [], isLoading } = useQuery({
    queryKey: ['scans', date],
    queryFn: async () => {
      const res = await fetch(`/api/scans?date=${date}`);
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json() as Promise<ScanEntry[]>;
    },
    refetchInterval: 3000,
  });

  // 4. Fetch Duplicate Attempts for active date
  const { data: duplicates = [], refetch: refetchDuplicates } = useQuery({
    queryKey: ['duplicates', date],
    queryFn: async () => {
      const res = await fetch(`/api/duplicates?date=${date}`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000,
  });

  // Mutation: Add Scan directly to PostgreSQL
  const scanMutation = useMutation({
    mutationFn: async (newScan: { barcode: string; companyId: string; dispatchDate: string }) => {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newScan),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(errorData));
      }
      return res.json();
    },
    onMutate: async (newScan) => {
      await queryClient.cancelQueries({ queryKey: ['scans', date] });
      const previousScans = queryClient.getQueryData(['scans', date]);
      
      const tempId = 'temp-' + Math.random().toString(36).substring(2, 9);
      queryClient.setQueryData(['scans', date], (old: any) => [
        ...(old || []),
        { 
          id: tempId, 
          barcode: newScan.barcode, 
          column: newScan.companyId, 
          scannedAt: new Date().toISOString(), 
          source: 'Scanned',
          status: 'DISPATCHED'
        }
      ]);
      setRecentScanId(tempId);
      
      return { previousScans, tempId };
    },
    onError: (err, newScan, context) => {
      queryClient.setQueryData(['scans', date], context?.previousScans);
      playErrorSound();
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error === "DUPLICATE") {
          const existing = parsed.existing;
          const existingCol = existing?.companyId || existing?.column || "another column";
          const existingDate = existing?.dispatchDate || date;
          const cellAddress = existing?.cellAddress || "";
          const excelFileName = existing?.excelFileName || "";
          const sheetName = existing?.sheetName || "";
          const matchedScanId = existing?.id || '';

          // 1. Automatically open / navigate to historical date Excel file
          if (existingDate && existingDate !== date) {
            changeDate(existingDate);
          }

          // 2. Highlight matching cell in that date's sheet
          if (matchedScanId) {
            setHighlightCellId(matchedScanId);
            setDuplicateFlashId(matchedScanId);
            setTimeout(() => setHighlightCellId(''), 8000);
          }

          setStatusMsg({ 
            type: 'warning', 
            title: 'Duplicate Barcode Found', 
            text: `Barcode ${newScan.barcode} exists in ${formatFileDate(existingDate)} (Sheet: ${sheetName || 'Dispatch'}, Cell: ${cellAddress || 'N/A'}).` 
          });

          // 3. Open duplicate popup modal after locating and highlighting cell
          setTimeout(() => {
            setDuplicateModalData({
              barcode: newScan.barcode,
              attemptedCompany: newScan.companyId,
              existingScanId: matchedScanId,
              existingCompany: existingCol,
              existingDate: existingDate,
              existingScannedAt: existing?.scannedAt,
              duplicateAttemptId: parsed.duplicateAttemptId,
              excelFileName: excelFileName,
              sheetName: sheetName,
              cellAddress: cellAddress,
              gridRow: existing?.gridRow,
            });
          }, 450);

          refetchDuplicates();
        } else {
          setStatusMsg({ type: 'error', title: 'Scan Error', text: parsed.message || 'Failed to save scan.' });
        }
      } catch {
        setStatusMsg({ type: 'error', title: 'Server Error', text: 'Could not connect to database.' });
      }
      setTimeout(() => setStatusMsg(null), 4000);
    },
    onSuccess: (data, variables) => {
      playSuccessSound();
      setStatusMsg({ type: 'success', title: 'Scanned Successfully', text: `${variables.barcode} added to ${variables.companyId}.` });
      setTimeout(() => setStatusMsg(null), 1500);
      queryClient.invalidateQueries({ queryKey: ['scans', date] });
      refetchDates();
      refetchDuplicates();
    },
  });

  // Mutation: Soft / Hard Delete Scan
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/scans?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['scans', date] });
      const previousScans = queryClient.getQueryData<ScanEntry[]>(['scans', date]);
      if (previousScans) {
        queryClient.setQueryData<ScanEntry[]>(['scans', date], old => 
          (old || []).filter(s => s.id !== id)
        );
      }
      return { previousScans };
    },
    onError: (err, _, context) => {
      if (context?.previousScans) {
        queryClient.setQueryData(['scans', date], context.previousScans);
      }
      playErrorSound();
      setStatusMsg({ type: 'error', title: 'Delete Error', text: 'Failed to delete scan.' });
      setTimeout(() => setStatusMsg(null), 3000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans', date] });
      refetchDates();
      refetchDuplicates();
      setStatusMsg({ type: 'success', title: 'Deleted', text: 'Barcode removed from sheet.' });
      setTimeout(() => setStatusMsg(null), 1500);
    },
  });

  // Mutation: Update Scan (Edit Barcode, Column, or Status)
  const updateMutation = useMutation({
    mutationFn: async ({ id, barcode, companyId, status }: { id: string; barcode?: string; companyId?: string; status?: string }) => {
      const res = await fetch('/api/scans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, barcode, companyId, status }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update entry');
      }
      return res.json();
    },
    onMutate: async ({ id, barcode, companyId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['scans', date] });
      const previousScans = queryClient.getQueryData<ScanEntry[]>(['scans', date]);
      if (previousScans) {
        queryClient.setQueryData<ScanEntry[]>(['scans', date], old => 
          (old || []).map(s => s.id === id ? { 
            ...s, 
            barcode: barcode || s.barcode, 
            column: companyId || s.column,
            status: status || s.status,
          } : s)
        );
      }
      return { previousScans };
    },
    onError: (err: any, _, context) => {
      if (context?.previousScans) {
        queryClient.setQueryData(['scans', date], context.previousScans);
      }
      playErrorSound();
      setStatusMsg({ type: 'error', title: 'Update Error', text: err.message || 'Failed to update entry.' });
      setTimeout(() => setStatusMsg(null), 3000);
    },
    onSuccess: (data) => {
      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['scans', date] });
      refetchDates();
      refetchDuplicates();
      setStatusMsg({ type: 'success', title: 'Updated', text: `Scan updated to ${data.scan.barcode} (${data.scan.column} - ${data.scan.status}).` });
      setTimeout(() => setStatusMsg(null), 2000);
    },
  });

  // Handle Mark Status from Duplicate Modal Popup
  const handleMarkDuplicateStatus = async (status: 'RTS' | 'CANCELLED') => {
    if (!duplicateModalData) return;
    setIsMarkingDuplicate(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: duplicateModalData.existingScanId,
          status,
          duplicateAttemptId: duplicateModalData.duplicateAttemptId,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to update duplicate status");
      }

      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['scans', duplicateModalData.existingDate] });
      queryClient.invalidateQueries({ queryKey: ['scans', date] });
      refetchDuplicates();
      refetchDates();

      setStatusMsg({
        type: 'success',
        title: `Marked as ${status}`,
        text: `Barcode ${duplicateModalData.barcode} marked as ${status} in database and Excel.`,
      });
      setTimeout(() => setStatusMsg(null), 3000);
      setDuplicateModalData(null);
      refocusInput();
    } catch (e: any) {
      playErrorSound();
      alert("Failed to mark duplicate: " + e.message);
    } finally {
      setIsMarkingDuplicate(false);
    }
  };

  // Global Barcode Search Across Entire Database
  const handleSearchBarcode = async (rawCode?: string) => {
    const barcodeToSearch = (rawCode !== undefined ? rawCode : inputValue).trim();
    if (!barcodeToSearch) {
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    setIsSearchingBarcode(true);
    try {
      const res = await fetch(`/api/scans/search?barcode=${encodeURIComponent(barcodeToSearch)}`);
      const data = await res.json();

      if (data.found && data.scan) {
        const existing = data.scan;
        const existingDate = existing.dispatchDate;
        const cellAddress = existing.cellAddress;
        const sheetName = existing.sheetName;
        const excelFileName = existing.excelFileName;

        // 1. Automatically open / navigate to historical date Excel file
        if (existingDate && existingDate !== date) {
          changeDate(existingDate);
        }

        // 2. Highlight matching cell in that date's sheet
        setHighlightCellId(existing.id);
        setDuplicateFlashId(existing.id);
        setTimeout(() => setHighlightCellId(''), 8000);

        playErrorSound();
        setStatusMsg({
          type: 'warning',
          title: 'Duplicate Barcode Found',
          text: `Barcode ${existing.barcode} exists in ${formatFileDate(existingDate)} (Sheet: ${sheetName || 'Dispatch'}, Cell: ${cellAddress || 'N/A'}).`,
        });

        // 3. Open duplicate popup modal after locating and highlighting cell
        setTimeout(() => {
          setDuplicateModalData({
            barcode: existing.barcode,
            attemptedCompany: activeHeader,
            existingScanId: existing.id,
            existingCompany: existing.companyId || existing.column,
            existingDate: existingDate,
            existingScannedAt: existing.scannedAt,
            excelFileName: excelFileName,
            sheetName: sheetName,
            cellAddress: cellAddress,
            gridRow: existing.gridRow,
          });
        }, 450);
      } else {
        // Genuinely new barcode
        playSuccessSound();
        setStatusMsg({
          type: 'success',
          title: 'Barcode Not Found in DB',
          text: `Barcode "${barcodeToSearch}" does not exist anywhere in database. Ready to scan.`,
        });
        setTimeout(() => setStatusMsg(null), 3500);
      }
    } catch (e: any) {
      playErrorSound();
      setStatusMsg({
        type: 'error',
        title: 'Search Error',
        text: 'Failed to search database for barcode.',
      });
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  // Handle Mark Status from Duplicate Attempts Tab
  const handleMarkDuplicateFromTab = async (duplicateId: string, existingScanId: string, status: 'CANCELLED' | 'RTS' | 'RTO') => {
    try {
      const res = await fetch('/api/duplicates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: duplicateId, existingScanId, status }),
      });
      if (!res.ok) throw new Error("Failed to update duplicate status");

      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['scans', date] });
      refetchDuplicates();
      setStatusMsg({
        type: 'success',
        title: 'Status Updated',
        text: `Duplicate record marked as ${status}.`,
      });
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (e: any) {
      playErrorSound();
      alert("Error updating duplicate: " + e.message);
    }
  };

  // Mutation: Add Custom Company
  const addCompanyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to add company');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setActiveHeader(data.name);
      setShowAddColumnModal(false);
      setNewColumnName('');
    },
  });

  const refocusInput = () => {
    // Always refocus the barcode input unless user is editing in the action bar
    // (the action bar edit input has a different ref)
    if (document.activeElement !== inputRef.current) {
      // Don't steal focus from the ExcelSheetView edit bar inputs
      const isEditBarInput = document.activeElement?.closest('.excel-sheet-container');
      if (!isEditBarInput) {
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 50);
      }
    }
  };

  // Keyboard shortcuts and refocus (NEVER steal focus when clicking in sheet or inputs)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Do NOT steal focus if user clicked inside the sheet, any input, button, select, or modal
      if (
        target.closest('.excel-sheet-container') ||
        target.closest('input') ||
        target.closest('button') ||
        target.closest('select') ||
        target.closest('[role="dialog"]') ||
        target.closest('.fixed')
      ) {
        return;
      }
      if (inputRef.current && !isReadOnly && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    };

    window.addEventListener('click', handleClick);

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= headers.length) {
        setActiveHeader(headers[num - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [headers, isReadOnly]);

  // Auto-focus safety net: keep barcode input focused ONLY when idle
  useEffect(() => {
    const interval = setInterval(() => {
      if (!inputRef.current || isReadOnly) return;
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
        if (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'BUTTON' ||
          activeEl.closest('.excel-sheet-container') ||
          activeEl.closest('[role="dialog"]')
        ) {
          return;
        }
      }
      inputRef.current.focus();
    }, 2000);
    return () => clearInterval(interval);
  }, [isReadOnly]);

  // Handle Scanning Barcode
  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = inputValue.trim();
    if (!barcode) return;
    
    if (isReadOnly) {
      playErrorSound();
      setStatusMsg({ type: 'warning', title: 'Read Only Sheet', text: 'Unlock this past date to make edits or scans.' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }
    
    scanMutation.mutate({ barcode, companyId: activeHeader, dispatchDate: date });
    setInputValue('');
  };

  // Date shifting
  const shiftDate = (days: number) => {
    const current = new Date(date);
    current.setDate(current.getDate() + days);
    const newDateStr = current.toISOString().split('T')[0];
    changeDate(newDateStr);
  };

  // Auth Protection Gate
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-bold tracking-wide text-slate-300">Verifying session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  // Grand Total & Company Counts
  const totalScans = scans.length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white px-6 py-3 flex flex-wrap gap-4 items-center justify-between shadow-lg z-10 shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-black tracking-wider text-white">DISPATCH SCANNER</h1>
          </div>

          {/* Quick Date Controls */}
          <div className="flex items-center space-x-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
            <button 
              onClick={() => changeDate(todayStr)}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${date === todayStr ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}
            >
              Today
            </button>
            <button 
              onClick={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                changeDate(y.toISOString().split('T')[0]);
              }}
              className="px-2.5 py-1 text-xs font-bold rounded text-slate-300 hover:text-white"
            >
              Yesterday
            </button>
            <button onClick={() => shiftDate(-1)} title="Previous Day" className="p-1 hover:bg-slate-700 rounded text-slate-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input 
              type="date" 
              className="bg-slate-900 text-white text-xs font-semibold px-2 py-1 rounded border border-slate-700 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert" 
              value={date} 
              onChange={(e) => { if (e.target.value) changeDate(e.target.value); }} 
            />
            <button onClick={() => shiftDate(1)} title="Next Day" className="p-1 hover:bg-slate-700 rounded text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Saved Dates Dropdown */}
            {savedDates.length > 0 && (
              <select 
                value={savedDates.some(d => d.date === date) ? date : ""} 
                onChange={(e) => { if (e.target.value) changeDate(e.target.value); }}
                className="bg-slate-900 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700 outline-none cursor-pointer"
              >
                <option value="">Saved dates...</option>
                {savedDates.map(d => (
                  <option key={d.date} value={d.date}>
                    {formatFileDate(d.date)} ({d.count} scans)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Right Header Controls: Database Status, Export, Backup, User info & Logout */}
        <div className="flex items-center space-x-3">
         
         

          {/* Export Excel Button */}
          <a 
            href={`/api/export?date=${date}`} 
            download
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </a>

          {/* Database Backup Button */}
          <a 
            href="/api/backup" 
            download
            className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup DB</span>
          </a>

          {/* User info & Logout */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-700">
            <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-semibold bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <UserIcon className="w-3.5 h-3.5 text-blue-400" />
              <span className="truncate max-w-[140px]">{currentUser.username}</span>
            </div>
            <button 
              onClick={handleLogout}
              title="Sign Out"
              className="flex items-center space-x-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Read-Only Warning Banner */}
      {isPastDate && (
        <div className={`px-6 py-2.5 flex items-center justify-between text-sm font-semibold transition-colors ${
          isReadOnly ? 'bg-amber-100 text-amber-900 border-b border-amber-200' : 'bg-blue-100 text-blue-900 border-b border-blue-200'
        }`}>
          <div className="flex items-center space-x-2">
            {isReadOnly ? <Lock className="w-4 h-4 text-amber-700" /> : <Unlock className="w-4 h-4 text-blue-700" />}
            <span>
              {isReadOnly 
                ? `Viewing past sheet for ${formatFileDate(date)} (Read-Only Mode)` 
                : `Editing past sheet for ${formatFileDate(date)} (Unlocked)`}
            </span>
          </div>
          <button 
            onClick={() => setIsPastUnlocked(!isPastUnlocked)}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
              isReadOnly ? 'bg-amber-800 text-white hover:bg-amber-900' : 'bg-blue-800 text-white hover:bg-blue-900'
            }`}
          >
            {isReadOnly ? 'Unlock to Edit' : 'Lock Sheet'}
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
        {/* Controls Row: Column Tabs & Scanner Input */}
        <div className="flex flex-col lg:flex-row gap-4 shrink-0">
          {/* Column Picker */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:w-2/3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">SELECT COLUMN (Keys 1-{headers.length})</span>
                <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                  Total: {totalScans}
                </span>
              </div>
              <button 
                onClick={() => setShowAddColumnModal(true)}
                className="flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-52 overflow-y-auto pr-1">
              {headers.map((header, idx) => {
                const isActive = activeHeader === header;
                const count = scans.filter(e => e.column === header).length;
                return (
                  <button 
                    key={header} 
                    onClick={() => { setActiveHeader(header); setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 100); }} 
                    className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                      isActive 
                        ? 'border-blue-600 bg-blue-50/80 shadow-md ring-2 ring-blue-500/20' 
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
                      <span className={`text-xs font-extrabold px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {count}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-800 truncate" title={header}>
                      {header}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Big Barcode Scan Box & Feedback Banner */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:w-1/3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                  ACTIVE: <span className="text-blue-600 font-extrabold">{activeHeader}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Press Enter to scan</span>
              </div>
              <form onSubmit={handleScan} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input 
                    ref={inputRef} 
                    type="text" 
                    disabled={isReadOnly}
                    className={`w-full text-2xl font-mono px-4 py-3 pr-10 border-2 rounded-xl outline-none transition-all ${
                      isReadOnly 
                        ? 'bg-slate-100 border-slate-300 cursor-not-allowed text-slate-400' 
                        : 'border-blue-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 text-slate-900 bg-white'
                    }`}
                    placeholder={isReadOnly ? "Sheet is locked..." : "Scan or type barcode..."} 
                    value={inputValue} 
                    onChange={(e) => setInputValue(e.target.value)} 
                    autoFocus 
                  />
                  {inputValue && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => { setInputValue(''); if (inputRef.current) inputRef.current.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                      title="Clear input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchBarcode()}
                  disabled={isSearchingBarcode || !inputValue.trim()}
                  title="Search barcode globally across all historical dates and Excel sheets"
                  className="px-4 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  {isSearchingBarcode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                  <span className="text-xs uppercase font-black hidden sm:inline">Search</span>
                </button>
              </form>

              {/* Status Section Buttons (Cancelled & RTO) */}
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => setStatusModalType('CANCELLED')}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-all font-bold text-xs shadow-xs hover:shadow-sm cursor-pointer"
                  title="View all Cancelled barcodes for this date"
                >
                  <div className="flex items-center space-x-1.5">
                    <Ban className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Cancelled</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-600 text-white shadow-xs">
                    {scans.filter(s => s.status === 'CANCELLED').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusModalType('RTO')}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 transition-all font-bold text-xs shadow-xs hover:shadow-sm cursor-pointer"
                  title="View all RTO barcodes for this date"
                >
                  <div className="flex items-center space-x-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>RTO</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-600 text-white shadow-xs">
                    {scans.filter(s => s.status === 'RTO').length}
                  </span>
                </button>
              </div>
            </div>

            {/* Notification / Sound Alert Banner */}
            <div className="mt-2 min-h-[50px] flex items-center">
              {statusMsg ? (
                <div className={`w-full p-2.5 rounded-lg flex items-center space-x-2.5 text-xs font-bold transition-all shadow-sm ${
                  statusMsg.type === 'success' 
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                    : statusMsg.type === 'error'
                    ? 'bg-red-100 text-red-900 border-2 border-red-400 animate-pulse'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  <AlertCircle className={`w-4 h-4 shrink-0 ${statusMsg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`} />
                  <div className="truncate">
                    <span className="font-black mr-1">{statusMsg.title}:</span>
                    <span>{statusMsg.text}</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-xs font-medium italic">
                  Auto-focus active. Barcode scanner ready.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Excel Sheet View */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-300 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-2" />
              <p className="text-sm font-bold text-slate-500">Loading dispatch sheet...</p>
            </div>
          ) : (
            <ExcelSheetView 
              date={formatFileDate(date)}
              rawDate={date}
              entries={scans}
              duplicates={duplicates}
              settings={{ headers, activeHeader }}
              recentScanId={recentScanId}
              duplicateFlashId={duplicateFlashId}
              highlightCellId={highlightCellId}
              onDelete={(id) => deleteMutation.mutate(id)}
              onUpdate={(id, newBarcode, newCompany, status) => updateMutation.mutate({ id, barcode: newBarcode, companyId: newCompany, status })}
              onMarkDuplicateStatus={handleMarkDuplicateFromTab}
              onRefocusInput={refocusInput}
              isReadOnly={isReadOnly}
              onUnlock={() => setIsPastUnlocked(true)}
            />
          )}
        </div>
      </main>

      {/* Duplicate Barcode Popup Modal */}
      <DuplicateModal 
        data={duplicateModalData}
        onClose={() => { setDuplicateModalData(null); refocusInput(); }}
        onMarkStatus={handleMarkDuplicateStatus}
        isLoading={isMarkingDuplicate}
      />

      {/* Cancelled / RTO Barcodes List Modal */}
      <StatusBarcodesModal 
        isOpen={statusModalType !== null}
        onClose={() => { setStatusModalType(null); refocusInput(); }}
        initialStatus={statusModalType || 'CANCELLED'}
        date={formatFileDate(date)}
        scans={scans}
        duplicates={duplicates}
        onUpdateScanStatus={async (id, status) => {
          await updateMutation.mutateAsync({ id, status });
        }}
        onDeleteScan={async (id) => {
          await deleteMutation.mutateAsync(id);
        }}
      />

      {/* Add Custom Column Modal */}
      {showAddColumnModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-3">Add Custom Company Column</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (newColumnName.trim()) {
                addCompanyMutation.mutate(newColumnName.trim());
              }
            }}>
              <input 
                type="text"
                placeholder="Company Name (e.g. DTDC, Ecom)"
                className="w-full text-base p-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddColumnModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!newColumnName.trim()}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg"
                >
                  Add Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold">Loading Dispatch Scanner...</div>}>
      <DispatchScannerApp />
    </Suspense>
  );
}
