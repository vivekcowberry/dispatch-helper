import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ScanEntry, AppSettings } from '@/types';
import { Trash2, Copy, Check, Save, X, Edit3, ArrowRight } from 'lucide-react';

interface Props {
  date: string;
  entries: ScanEntry[];
  settings: AppSettings;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, newBarcode: string, newCompany: string) => void;
  onRefocusInput: () => void;
  recentScanId?: string;
  duplicateFlashId?: string;
  isReadOnly?: boolean;
  onUnlock?: () => void;
}

export default function ExcelSheetView({
  date,
  entries,
  settings,
  onDelete,
  onUpdate,
  onRefocusInput,
  recentScanId,
  duplicateFlashId,
  isReadOnly,
  onUnlock,
}: Props) {
  const [selectedCell, setSelectedCell] = useState<{ id: string, column: string, row: number, barcode: string } | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editBarcode, setEditBarcode] = useState<string>('');
  const [editColumn, setEditColumn] = useState<string>('');
  
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
    if (recentScanId) {
      const el = document.getElementById(`cell-${recentScanId}`);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [recentScanId]);
  
  // Scroll to duplicate flash
  useEffect(() => {
    if (duplicateFlashId) {
      const el = document.getElementById(`cell-${duplicateFlashId}`);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [duplicateFlashId]);

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
    setSelectedCell({ id: entry.id, column: entry.column, row, barcode: entry.barcode });
    setSelectedRow(row);
    setEditBarcode(entry.barcode);
    setEditColumn(entry.column);
    setEditingInlineId(null);
  };

  const handleCellDoubleClick = (entry: ScanEntry, row: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCell({ id: entry.id, column: entry.column, row, barcode: entry.barcode });
    setSelectedRow(row);
    setEditBarcode(entry.barcode);
    setEditColumn(entry.column);
    setEditingInlineId(entry.id);
    setInlineBarcode(entry.barcode);
  };

  const handleRowClick = (rowIndex: number, actualRow: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedRow(actualRow);

    // Find any entries present in this row
    const rowEntries: Array<{ column: string; entry: ScanEntry }> = [];
    settings.headers.forEach(h => {
      const entry = columnData[h][rowIndex];
      if (entry) rowEntries.push({ column: h, entry });
    });

    if (rowEntries.length > 0) {
      // If currently selected cell is in this row, keep it, otherwise select the first one
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
    onUpdate(selectedCell.id, trimmed, editColumn);
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

  return (
    <div 
      className="flex-1 flex flex-col bg-white border border-slate-300 rounded-lg shadow-sm min-h-0 excel-sheet-container overflow-hidden relative font-sans text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header Bar / Formula Action Bar */}
      {selectedCell ? (
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
                className="bg-slate-800 border-2 border-blue-500 text-white font-mono text-sm px-3 py-1 rounded-md outline-none focus:ring-2 focus:ring-blue-400 w-56 sm:w-72 font-semibold shadow-inner"
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
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={handleUpdate}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-3.5 py-1.5 rounded-md text-xs font-bold transition-all shadow-md cursor-pointer"
              title="Save changes to this scan (Enter)"
            >
              <Save className="w-4 h-4" />
              <span>Update Barcode</span>
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
      ) : (
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex justify-between items-center z-10 sticky top-0">
          <div className="flex space-x-2 items-center">
            <div className="bg-white px-4 py-1 rounded-t-md border border-slate-300 border-b-0 -mb-[9px] font-bold text-slate-700 shadow-sm relative z-20">
              Dispatch {date}
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline ml-4">
              💡 <strong>Click any cell or row</strong> to <strong className="text-blue-600">Update</strong> or <strong className="text-red-600">Delete</strong> barcode (Double-click to edit inline)
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Total Scans: {entries.length}
          </div>
        </div>
      )}

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-[#f8f9fa] relative">
        <div className="inline-block min-w-full pb-10">
          
          {/* Header Row (Letters + Company) */}
          <div className="sticky top-0 z-20 flex bg-slate-50 shadow-sm">
            {/* Top-Left empty corner */}
            <div className="sticky left-0 z-30 w-12 border-b border-r border-slate-300 bg-slate-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-500">
              #
            </div>
            
            {settings.headers.map((h, i) => {
              const count = columnData[h].length;
              return (
                <div key={h} className="w-48 flex-shrink-0 border-b border-r border-slate-300 bg-slate-100 flex flex-col">
                  {/* Column Letter */}
                  <div className="text-center text-xs font-semibold text-slate-500 bg-slate-200 py-1 border-b border-slate-300">
                    {getColLetter(i)}
                  </div>
                  {/* Company Name */}
                  <div className="px-2 py-1.5 font-bold text-slate-700 text-center truncate">
                    {h} <span className="font-normal text-slate-500 text-xs">({count})</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {Array.from({ length: maxRows }).map((_, rowIndex) => {
            const actualRow = rowIndex + 2; // Row 1 is header
            const isRowSelected = selectedRow === actualRow;

            return (
              <div 
                key={rowIndex} 
                className={`flex transition-colors ${isRowSelected ? 'bg-blue-50/50' : ''}`}
              >
                {/* Row Number - Clickable to select row */}
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
                  
                  return (
                    <div 
                      key={`${h}-${rowIndex}`} 
                      className={`w-48 flex-shrink-0 border-b border-r border-slate-200 px-2 py-1.5 relative cursor-pointer select-none transition-all group ${
                        isSelected 
                          ? 'ring-2 ring-blue-600 ring-inset z-10 bg-blue-50 font-semibold shadow-xs' 
                          : isRowSelected && entry
                          ? 'bg-blue-50/40'
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
                            <span className="font-mono text-slate-800 truncate text-xs font-medium">
                              {entry.barcode}
                            </span>
                            
                            {/* Hover Quick Actions (Edit / Delete) */}
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

                            {/* Source indicator tag */}
                            {entry.source === 'Imported' ? (
                               <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 shrink-0" title="Imported"></span>
                            ) : (
                               <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1 shrink-0" title="Scanned"></span>
                            )}
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
    </div>
  );
}
