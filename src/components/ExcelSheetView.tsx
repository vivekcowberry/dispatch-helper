"use client";

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ScanEntry, AppSettings } from '@/types';
import { 
  Trash2, Copy, Check, Save, X, Edit3, Grid, FileText, 
  ListOrdered, AlertTriangle, Ban, RotateCcw, CheckCircle2, 
  Search, Filter, Building2, Package, ArrowUpRight
} from 'lucide-react';

export interface DuplicateRecord {
  id: string;
  barcode: string;
  attemptedColumn: string;
  existingColumn: string;
  existingDate: string;
  time: string;
  status: string;
  existingScanId: string;
}

interface Props {
  date: string;
  rawDate: string;
  entries: ScanEntry[];
  duplicates?: DuplicateRecord[];
  settings: AppSettings;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, newBarcode: string, newCompany: string, status?: string) => void;
  onMarkDuplicateStatus?: (duplicateId: string, existingScanId: string, status: 'CANCELLED' | 'RTO') => void;
  onRefocusInput: () => void;
  recentScanId?: string;
  duplicateFlashId?: string;
  isReadOnly?: boolean;
  onUnlock?: () => void;
}

type TabMode = 'grid' | 'summary' | 'scan_log' | 'duplicates';

export default function ExcelSheetView({
  date,
  rawDate,
  entries,
  duplicates = [],
  settings,
  onDelete,
  onUpdate,
  onMarkDuplicateStatus,
  onRefocusInput,
  recentScanId,
  duplicateFlashId,
  isReadOnly,
  onUnlock,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabMode>('grid');

  // Search & Filter for Scan Log
  const [logSearch, setLogSearch] = useState('');
  const [logCompanyFilter, setLogCompanyFilter] = useState('ALL');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL');

  // Cell selection state
  const [selectedCell, setSelectedCell] = useState<{ id: string, column: string, row: number, barcode: string, status?: string } | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editBarcode, setEditBarcode] = useState<string>('');
  const [editColumn, setEditColumn] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('DISPATCHED');
  
  // Inline cell editing state
  const [editingInlineId, setEditingInlineId] = useState<string | null>(null);
  const [inlineBarcode, setInlineBarcode] = useState<string>('');
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topInputRef = useRef<HTMLInputElement>(null);
  
  // Sort entries ascending by scannedAt
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime());
  }, [entries]);

  // Group by column
  const columnData = useMemo(() => {
    const data: Record<string, ScanEntry[]> = {};
    settings.headers.forEach(h => data[h] = []);
    sortedEntries.forEach(entry => {
      if (data[entry.column]) {
        data[entry.column].push(entry);
      }
    });
    return data;
  }, [sortedEntries, settings.headers]);
  
  const maxEntriesInAnyColumn = Math.max(0, ...settings.headers.map(h => columnData[h]?.length || 0));
  const maxRows = Math.max(30, maxEntriesInAnyColumn + 5);
  
  // Convert index to column letter (A, B, C...)
  const getColLetter = (index: number) => {
    let letter = '';
    let temp = index + 1;
    while (temp > 0) {
      const modulo = (temp - 1) % 26;
      letter = String.fromCharCode(65 + modulo) + letter;
      temp = Math.floor((temp - modulo) / 26);
    }
    return letter;
  };

  // Scroll to newest cell
  useEffect(() => {
    if (recentScanId && activeTab === 'grid') {
      const el = document.getElementById(`cell-${recentScanId}`);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [recentScanId, activeTab]);
  
  // Scroll to duplicate flash
  useEffect(() => {
    if (duplicateFlashId && activeTab === 'grid') {
      const el = document.getElementById(`cell-${duplicateFlashId}`);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [duplicateFlashId, activeTab]);

  // Auto-focus inline input when editing
  useEffect(() => {
    if (editingInlineId && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingInlineId]);

  // When a cell is selected, focus the top edit input
  useEffect(() => {
    if (selectedCell && topInputRef.current && !editingInlineId) {
      topInputRef.current.focus();
      topInputRef.current.select();
    }
  }, [selectedCell, editingInlineId]);

  const checkUnlockPermission = (): boolean => {
    if (isReadOnly) {
      const wantUnlock = confirm("This past sheet is locked in Read-Only mode.\nUnlock it to save changes?");
      if (wantUnlock && onUnlock) {
        onUnlock();
        return true;
      }
      return false;
    }
    return true;
  };

  const handleCellClick = (entry: ScanEntry, row: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCell({ id: entry.id, column: entry.column, row, barcode: entry.barcode, status: entry.status || 'DISPATCHED' });
    setSelectedRow(row);
    setEditBarcode(entry.barcode);
    setEditColumn(entry.column);
    setEditStatus(entry.status || 'DISPATCHED');
    setEditingInlineId(null);
  };

  const handleCellDoubleClick = (entry: ScanEntry, row: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCell({ id: entry.id, column: entry.column, row, barcode: entry.barcode, status: entry.status || 'DISPATCHED' });
    setSelectedRow(row);
    setEditBarcode(entry.barcode);
    setEditColumn(entry.column);
    setEditStatus(entry.status || 'DISPATCHED');
    setEditingInlineId(entry.id);
    setInlineBarcode(entry.barcode);
  };

  const handleRowClick = (rowIndex: number, actualRow: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedRow(actualRow);

    const rowEntries: Array<{ column: string; entry: ScanEntry }> = [];
    settings.headers.forEach(h => {
      const entry = columnData[h][rowIndex];
      if (entry) rowEntries.push({ column: h, entry });
    });

    if (rowEntries.length > 0) {
      const existingInRow = rowEntries.find(r => r.entry.id === selectedCell?.id);
      const chosen = existingInRow || rowEntries[0];
      handleCellClick(chosen.entry, actualRow);
    } else {
      setSelectedCell(null);
      setEditingInlineId(null);
    }
  };
  
  const handleCopy = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (selectedCell) {
      navigator.clipboard.writeText(selectedCell.barcode);
      setSelectedCell(null);
      onRefocusInput();
    }
  };
  
  const handleDelete = (entryToDelete?: { id: string; barcode: string; column: string }, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = entryToDelete || selectedCell;
    if (!target) return;

    if (!checkUnlockPermission()) return;

    if (confirm(`Delete barcode "${target.barcode}" from column "${target.column}"?`)) {
      onDelete(target.id);
      setSelectedCell(null);
      setSelectedRow(null);
      setEditingInlineId(null);
      onRefocusInput();
    }
  };

  const handleUpdate = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedCell || !onUpdate) return;

    if (!checkUnlockPermission()) return;

    const trimmed = editBarcode.trim();
    if (!trimmed) {
      alert("Barcode cannot be empty");
      return;
    }
    onUpdate(selectedCell.id, trimmed, editColumn, editStatus);
    setSelectedCell(null);
    setSelectedRow(null);
    setEditingInlineId(null);
    onRefocusInput();
  };

  const handleInlineSave = (id: string, column: string) => {
    if (!onUpdate) return;
    const trimmed = inlineBarcode.trim();
    if (!trimmed) {
      setEditingInlineId(null);
      return;
    }
    if (trimmed !== selectedCell?.barcode) {
      if (!checkUnlockPermission()) {
        setEditingInlineId(null);
        return;
      }
      onUpdate(id, trimmed, column);
    }
    setEditingInlineId(null);
    setSelectedCell(null);
    setSelectedRow(null);
    onRefocusInput();
  };

  // Status Summary Calculations
  const summaryCounts = useMemo(() => {
    let dispatched = 0;
    let cancelled = 0;
    let rto = 0;

    entries.forEach(e => {
      const s = (e.status || 'DISPATCHED').toUpperCase();
      if (s === 'CANCELLED') cancelled++;
      else if (s === 'RTO') rto++;
      else dispatched++;
    });

    const companyBreakdown = settings.headers.map(h => {
      const items = columnData[h] || [];
      const cDispatched = items.filter(e => (e.status || 'DISPATCHED').toUpperCase() === 'DISPATCHED').length;
      const cCancelled = items.filter(e => (e.status || '').toUpperCase() === 'CANCELLED').length;
      const cRto = items.filter(e => (e.status || '').toUpperCase() === 'RTO').length;
      return {
        company: h,
        total: items.length,
        dispatched: cDispatched,
        cancelled: cCancelled,
        rto: cRto,
        percent: entries.length > 0 ? ((items.length / entries.length) * 100).toFixed(1) : '0',
      };
    });

    return {
      total: entries.length,
      dispatched,
      cancelled,
      rto,
      duplicatesCount: duplicates.length,
      companies: companyBreakdown,
    };
  }, [entries, duplicates, settings.headers, columnData]);

  // Filtered Scan Log
  const filteredLog = useMemo(() => {
    return sortedEntries.filter(entry => {
      if (logSearch) {
        const q = logSearch.toLowerCase();
        if (!entry.barcode.toLowerCase().includes(q) && !entry.column.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (logCompanyFilter !== 'ALL' && entry.column !== logCompanyFilter) {
        return false;
      }
      if (logStatusFilter !== 'ALL') {
        const s = (entry.status || 'DISPATCHED').toUpperCase();
        if (s !== logStatusFilter) return false;
      }
      return true;
    });
  }, [sortedEntries, logSearch, logCompanyFilter, logStatusFilter]);

  return (
    <div 
      className="flex-1 flex flex-col bg-white border border-slate-300 rounded-lg shadow-sm min-h-0 excel-sheet-container overflow-hidden relative font-sans text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Workbook Sheet Tabs Header */}
      <div className="bg-slate-200 border-b border-slate-300 px-3 pt-2 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex space-x-1 items-end">
          {/* Tab 1: Dispatch Grid */}
          <button
            onClick={() => { setActiveTab('grid'); setSelectedCell(null); }}
            className={`px-3.5 py-1.5 rounded-t-lg font-bold text-xs flex items-center space-x-1.5 border transition-all cursor-pointer ${
              activeTab === 'grid'
                ? 'bg-white border-slate-300 border-b-transparent text-blue-700 shadow-sm relative z-10'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Dispatch Grid</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-extrabold">
              {entries.length}
            </span>
          </button>

          {/* Tab 2: Summary */}
          <button
            onClick={() => { setActiveTab('summary'); setSelectedCell(null); }}
            className={`px-3.5 py-1.5 rounded-t-lg font-bold text-xs flex items-center space-x-1.5 border transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-white border-slate-300 border-b-transparent text-emerald-700 shadow-sm relative z-10'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Summary</span>
          </button>

          {/* Tab 3: Scan Log */}
          <button
            onClick={() => { setActiveTab('scan_log'); setSelectedCell(null); }}
            className={`px-3.5 py-1.5 rounded-t-lg font-bold text-xs flex items-center space-x-1.5 border transition-all cursor-pointer ${
              activeTab === 'scan_log'
                ? 'bg-white border-slate-300 border-b-transparent text-indigo-700 shadow-sm relative z-10'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Scan Log</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
              {entries.length}
            </span>
          </button>

          {/* Tab 4: Duplicate Attempts */}
          <button
            onClick={() => { setActiveTab('duplicates'); setSelectedCell(null); }}
            className={`px-3.5 py-1.5 rounded-t-lg font-bold text-xs flex items-center space-x-1.5 border transition-all cursor-pointer ${
              activeTab === 'duplicates'
                ? 'bg-white border-slate-300 border-b-transparent text-amber-700 shadow-sm relative z-10'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Duplicate Attempts</span>
            {duplicates.length > 0 && (
              <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-extrabold animate-pulse">
                {duplicates.length}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-500 pb-1.5">
          Dispatch Date: <strong className="text-slate-800">{date}</strong>
        </div>
      </div>

      {/* TOP FORMULA / ACTION BAR (When activeTab is 'grid' and cell selected) */}
      {activeTab === 'grid' && selectedCell && (
        <div 
          className="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap gap-3 items-center justify-between border-b border-slate-700 shadow-md z-30 sticky top-0 animate-in fade-in duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center space-x-3 flex-wrap">
            <div className="bg-blue-600 text-white font-bold px-3 py-1 rounded text-xs shadow flex items-center space-x-1">
              <span>{selectedCell.column}</span>
              <span className="text-blue-200 text-[11px]">(Row {selectedCell.row})</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wide">Barcode:</span>
              <input 
                ref={topInputRef}
                type="text"
                value={editBarcode}
                onChange={(e) => setEditBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdate();
                  if (e.key === 'Escape') { setSelectedCell(null); setSelectedRow(null); onRefocusInput(); }
                }}
                className="bg-slate-800 border-2 border-blue-500 text-white font-mono text-sm px-3 py-1 rounded-md outline-none focus:ring-2 focus:ring-blue-400 w-52 sm:w-64 font-semibold shadow-inner"
                autoFocus
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-slate-400 font-semibold">Column:</span>
              <select
                value={editColumn}
                onChange={(e) => setEditColumn(e.target.value)}
                className="bg-slate-800 border border-slate-600 text-white text-xs px-2.5 py-1.5 rounded outline-none cursor-pointer hover:border-slate-500 font-medium"
              >
                {settings.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-slate-400 font-semibold">Status:</span>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="bg-slate-800 border border-slate-600 text-white text-xs px-2.5 py-1.5 rounded outline-none cursor-pointer font-bold"
              >
                <option value="DISPATCHED">Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="RTO">RTO</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={handleUpdate}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-3.5 py-1.5 rounded-md text-xs font-bold transition-all shadow-md cursor-pointer"
              title="Save changes to this scan (Enter)"
            >
              <Save className="w-4 h-4" />
              <span>Update</span>
            </button>

            <button 
              onClick={() => handleDelete()}
              className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow cursor-pointer"
              title="Delete this scan from database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <button 
              onClick={handleCopy}
              className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer"
              title="Copy barcode to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            <button 
              onClick={() => { setSelectedCell(null); setSelectedRow(null); setEditingInlineId(null); onRefocusInput(); }}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Cancel / Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DISPATCH GRID                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'grid' && (
        <div ref={scrollRef} className="flex-1 overflow-auto bg-[#f8f9fa] relative">
          <div className="inline-block min-w-full pb-10">
            {/* Header Row (Letters + Company) */}
            <div className="sticky top-0 z-20 flex bg-slate-50 shadow-sm">
              <div className="sticky left-0 z-30 w-12 border-b border-r border-slate-300 bg-slate-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-500">
                #
              </div>
              
              {settings.headers.map((h, i) => {
                const count = columnData[h].length;
                return (
                  <div key={h} className="w-48 flex-shrink-0 border-b border-r border-slate-300 bg-slate-100 flex flex-col">
                    <div className="text-center text-xs font-semibold text-slate-500 bg-slate-200 py-1 border-b border-slate-300">
                      {getColLetter(i)}
                    </div>
                    <div className="px-2 py-1.5 font-bold text-slate-700 text-center truncate">
                      {h} <span className="font-normal text-slate-500 text-xs">({count})</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {Array.from({ length: maxRows }).map((_, rowIndex) => {
              const actualRow = rowIndex + 2;
              const isRowSelected = selectedRow === actualRow;

              return (
                <div 
                  key={rowIndex} 
                  className={`flex transition-colors ${isRowSelected ? 'bg-blue-50/50' : ''}`}
                >
                  {/* Row Number */}
                  <div 
                    onClick={(e) => handleRowClick(rowIndex, actualRow, e)}
                    title={`Click to select Row ${actualRow}`}
                    className={`sticky left-0 z-10 w-12 border-b border-r border-slate-300 text-center text-xs flex items-center justify-center font-semibold flex-shrink-0 cursor-pointer transition-colors select-none ${
                      isRowSelected 
                        ? 'bg-blue-600 text-white font-bold shadow-md' 
                        : 'bg-slate-200 text-slate-600 hover:bg-blue-100 hover:text-blue-800'
                    }`}
                  >
                    {actualRow}
                  </div>
                  
                  {/* Cells */}
                  {settings.headers.map((h) => {
                    const entry = columnData[h][rowIndex];
                    const isSelected = selectedCell?.id === entry?.id;
                    const isRecent = recentScanId === entry?.id;
                    const isDuplicateFlash = duplicateFlashId === entry?.id;
                    const isInlineEditing = editingInlineId === entry?.id;
                    const isCancelled = entry?.status?.toUpperCase() === 'CANCELLED';
                    const isRto = entry?.status?.toUpperCase() === 'RTO';
                    
                    return (
                      <div 
                        key={`${h}-${rowIndex}`} 
                        className={`w-48 flex-shrink-0 border-b border-r border-slate-200 px-2 py-1.5 relative cursor-pointer select-none transition-all group ${
                          isSelected 
                            ? 'ring-2 ring-blue-600 ring-inset z-10 bg-blue-50 font-semibold shadow-xs' 
                            : isRowSelected && entry
                            ? 'bg-blue-50/40'
                            : isCancelled
                            ? 'bg-red-50/80 hover:bg-red-100/80'
                            : isRto
                            ? 'bg-amber-50/80 hover:bg-amber-100/80'
                            : 'bg-white'
                        } ${
                          isRecent ? 'bg-green-100 transition-colors duration-1000' : ''
                        } ${
                          isDuplicateFlash ? 'bg-red-300 transition-colors duration-500' : ''
                        } ${
                          !entry ? 'hover:bg-slate-50' : 'hover:bg-blue-50/70'
                        }`}
                        onClick={(e) => {
                          if (entry) handleCellClick(entry, actualRow, e);
                          else {
                            setSelectedCell(null);
                            setSelectedRow(actualRow);
                            setEditingInlineId(null);
                            onRefocusInput();
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (entry) handleCellDoubleClick(entry, actualRow, e);
                        }}
                        id={entry ? `cell-${entry.id}` : undefined}
                      >
                        {entry ? (
                          isInlineEditing ? (
                            <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                              <input 
                                ref={inlineInputRef}
                                type="text"
                                value={inlineBarcode}
                                onChange={(e) => setInlineBarcode(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleInlineSave(entry.id, entry.column);
                                  if (e.key === 'Escape') setEditingInlineId(null);
                                }}
                                onBlur={() => handleInlineSave(entry.id, entry.column)}
                                className="w-full bg-white border-2 border-blue-600 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none shadow-inner"
                                autoFocus
                              />
                              <button 
                                onClick={() => handleInlineSave(entry.id, entry.column)}
                                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                title="Save (Enter)"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-1 truncate">
                                <span className={`font-mono text-xs font-medium truncate ${
                                  isCancelled ? 'line-through text-red-700' : isRto ? 'text-amber-800 font-semibold' : 'text-slate-800'
                                }`}>
                                  {entry.barcode}
                                </span>
                                {isCancelled && (
                                  <span className="text-[9px] font-black uppercase bg-red-600 text-white px-1 py-0.2 rounded shrink-0">
                                    CANCELLED
                                  </span>
                                )}
                                {isRto && (
                                  <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-1 py-0.2 rounded shrink-0">
                                    RTO
                                  </span>
                                )}
                              </div>
                              
                              {/* Hover Quick Actions */}
                              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                                <button 
                                  onClick={(e) => handleCellDoubleClick(entry, actualRow, e)}
                                  title="Edit Barcode"
                                  className="p-0.5 hover:bg-blue-100 text-blue-600 rounded cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => handleDelete({ id: entry.id, barcode: entry.barcode, column: entry.column }, e)}
                                  title="Delete Barcode"
                                  className="p-0.5 hover:bg-red-100 text-red-600 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="h-5"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SUMMARY VIEW                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'summary' && (
        <div className="flex-1 overflow-auto p-6 bg-slate-50 space-y-6">
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">TOTAL SCANS</span>
              <span className="text-2xl font-black text-slate-900">{summaryCounts.total}</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block mb-1">DISPATCHED</span>
              <span className="text-2xl font-black text-emerald-800">{summaryCounts.dispatched}</span>
            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider block mb-1">CANCELLED</span>
              <span className="text-2xl font-black text-red-800">{summaryCounts.cancelled}</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block mb-1">RTO ORDERS</span>
              <span className="text-2xl font-black text-amber-800">{summaryCounts.rto}</span>
            </div>

            <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl shadow-xs col-span-2 sm:col-span-1">
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block mb-1">DUPLICATES</span>
              <span className="text-2xl font-black text-purple-800">{summaryCounts.duplicatesCount}</span>
            </div>
          </div>

          {/* Company Breakdown Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-sm text-slate-800">Company Breakdown</h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {summaryCounts.companies.length} Companies
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-4">Company</th>
                    <th className="py-2.5 px-4 text-center">Dispatched</th>
                    <th className="py-2.5 px-4 text-center">Cancelled</th>
                    <th className="py-2.5 px-4 text-center">RTO</th>
                    <th className="py-2.5 px-4 text-right">Total Scans</th>
                    <th className="py-2.5 px-4 text-right">% Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {summaryCounts.companies.map((c) => (
                    <tr key={c.company} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center space-x-2">
                        <span>{c.company}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-600">{c.dispatched}</td>
                      <td className="py-3 px-4 text-center font-bold text-red-600">{c.cancelled}</td>
                      <td className="py-3 px-4 text-center font-bold text-amber-600">{c.rto}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">{c.total}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${c.percent}%` }}></div>
                          </div>
                          <span className="font-mono text-slate-500 w-10 text-right">{c.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Grand Total Row */}
                  <tr className="bg-slate-100 font-black text-slate-900 text-sm border-t-2 border-slate-300">
                    <td className="py-3 px-4">Grand Total</td>
                    <td className="py-3 px-4 text-center text-emerald-700">{summaryCounts.dispatched}</td>
                    <td className="py-3 px-4 text-center text-red-700">{summaryCounts.cancelled}</td>
                    <td className="py-3 px-4 text-center text-amber-700">{summaryCounts.rto}</td>
                    <td className="py-3 px-4 text-right text-base text-blue-700">{summaryCounts.total}</td>
                    <td className="py-3 px-4 text-right font-mono">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SCAN LOG                                                           */}
      {/* ========================================================================= */}
      {activeTab === 'scan_log' && (
        <div className="flex-1 overflow-auto p-5 bg-slate-50 space-y-4">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
              <div className="relative w-full max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search barcode or company..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* Company Filter */}
              <select
                value={logCompanyFilter}
                onChange={(e) => setLogCompanyFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none font-medium cursor-pointer"
              >
                <option value="ALL">All Companies</option>
                {settings.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none font-medium cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="RTO">RTO</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 font-bold">
              Showing {filteredLog.length} of {entries.length} scans
            </div>
          </div>

          {/* Log Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-4 w-14">#</th>
                  <th className="py-2.5 px-4">Barcode</th>
                  <th className="py-2.5 px-4">Company</th>
                  <th className="py-2.5 px-4">Scanned Time</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLog.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                      No scans matching your search/filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLog.map((s, index) => {
                    const statusUpper = (s.status || 'DISPATCHED').toUpperCase();
                    const isCancelled = statusUpper === 'CANCELLED';
                    const isRto = statusUpper === 'RTO';

                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-400">{index + 1}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{s.barcode}</td>
                        <td className="py-2.5 px-4 font-bold text-blue-700">{s.column}</td>
                        <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                          {new Date(s.scannedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{s.source}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isCancelled 
                              ? 'bg-red-100 text-red-700 border border-red-200' 
                              : isRto 
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            {statusUpper}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => onUpdate?.(s.id, s.barcode, s.column, isCancelled ? 'DISPATCHED' : 'CANCELLED')}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                              isCancelled 
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                                : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200'
                            }`}
                          >
                            {isCancelled ? 'Unmark' : 'Cancel'}
                          </button>
                          <button
                            onClick={() => onUpdate?.(s.id, s.barcode, s.column, isRto ? 'DISPATCHED' : 'RTO')}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                              isRto 
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                                : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200'
                            }`}
                          >
                            {isRto ? 'Unmark' : 'RTO'}
                          </button>
                          <button
                            onClick={() => onDelete(s.id)}
                            className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors cursor-pointer ml-1"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DUPLICATE ATTEMPTS                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'duplicates' && (
        <div className="flex-1 overflow-auto p-5 bg-slate-50 space-y-4">
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-sm text-slate-800">Duplicate Attempts History</h3>
                <p className="text-xs text-slate-500">All duplicate scans logged on this dispatch date</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
              Total: {duplicates.length} Attempts
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-4 w-14">#</th>
                  <th className="py-2.5 px-4">Barcode</th>
                  <th className="py-2.5 px-4">Attempted Company</th>
                  <th className="py-2.5 px-4">Original Company</th>
                  <th className="py-2.5 px-4">Attempt Time</th>
                  <th className="py-2.5 px-4">Resolution</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {duplicates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 font-medium">
                      No duplicate attempts recorded for this date.
                    </td>
                  </tr>
                ) : (
                  duplicates.map((d, index) => {
                    const statusUpper = (d.status || 'DETECTED').toUpperCase();
                    const isCancelled = statusUpper === 'CANCELLED';
                    const isRto = statusUpper === 'RTO';

                    return (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-400">{index + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{d.barcode}</td>
                        <td className="py-3 px-4 font-bold text-amber-600">{d.attemptedColumn}</td>
                        <td className="py-3 px-4 font-bold text-blue-700">{d.existingColumn}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {new Date(d.time).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            isCancelled
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : isRto
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {statusUpper}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => onMarkDuplicateStatus?.(d.id, d.existingScanId, 'CANCELLED')}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold shadow transition-colors cursor-pointer"
                          >
                            Mark Cancelled
                          </button>
                          <button
                            onClick={() => onMarkDuplicateStatus?.(d.id, d.existingScanId, 'RTO')}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold shadow transition-colors cursor-pointer"
                          >
                            Mark RTO
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
