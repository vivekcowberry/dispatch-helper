import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ScanEntry, AppSettings } from '@/types';
import { Trash2, Copy } from 'lucide-react';

interface Props {
  date: string;
  entries: ScanEntry[];
  settings: AppSettings;
  onDelete: (id: string) => void;
  onRefocusInput: () => void;
  recentScanId?: string;
  duplicateFlashId?: string;
}

export default function ExcelSheetView({
  date,
  entries,
  settings,
  onDelete,
  onRefocusInput,
  recentScanId,
  duplicateFlashId,
}: Props) {
  const [selectedCell, setSelectedCell] = useState<{ id: string, column: string, row: number, barcode: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
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
  
  const maxRows = Math.max(30, ...settings.headers.map(h => columnData[h].length));
  
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

  const handleCellClick = (entry: ScanEntry, row: number) => {
    setSelectedCell({ id: entry.id, column: entry.column, row, barcode: entry.barcode });
  };
  
  const handleCopy = () => {
    if (selectedCell) {
      navigator.clipboard.writeText(selectedCell.barcode);
      setSelectedCell(null);
      onRefocusInput();
    }
  };
  
  const handleDelete = () => {
    if (selectedCell) {
      if (confirm(`Delete barcode ${selectedCell.barcode}?`)) {
        onDelete(selectedCell.id);
      }
      setSelectedCell(null);
      onRefocusInput();
    }
  };
  
  // Click outside to deselect
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.excel-sheet-container') && !target.closest('.excel-cell-action')) {
        setSelectedCell(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-300 rounded-lg shadow-sm min-h-0 excel-sheet-container overflow-hidden relative font-sans text-sm">
      {/* Excel Sheet Tab */}
      <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex justify-between items-center z-10 sticky top-0">
        <div className="flex space-x-2">
          <div className="bg-white px-4 py-1 rounded-t-md border border-slate-300 border-b-0 -mb-[9px] font-bold text-slate-700 shadow-sm relative z-20">
            Dispatch {date}
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-500">
          Total Scans: {entries.length}
        </div>
      </div>
      
      {/* Floating Action Menu */}
      {selectedCell && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white p-2 rounded-lg shadow-xl z-50 flex space-x-3 items-center excel-cell-action">
          <span className="font-mono bg-slate-700 px-2 py-1 rounded text-xs">{selectedCell.barcode}</span>
          <button onClick={handleCopy} className="hover:text-blue-400 p-1 rounded" title="Copy">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} className="hover:text-red-400 p-1 rounded" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => { setSelectedCell(null); onRefocusInput(); }} className="ml-2 text-slate-400 hover:text-white px-2">
            ×
          </button>
        </div>
      )}

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-[#f8f9fa] relative">
        <div className="inline-block min-w-full pb-10">
          
          {/* Header Row (Letters + Company) */}
          <div className="sticky top-0 z-30 flex bg-slate-50 shadow-sm">
            {/* Top-Left empty corner */}
            <div className="sticky left-0 z-40 w-12 border-b border-r border-slate-300 bg-slate-200 flex-shrink-0"></div>
            
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
            return (
              <div key={rowIndex} className="flex">
                {/* Row Number */}
                <div className="sticky left-0 z-20 w-12 border-b border-r border-slate-300 bg-slate-200 text-center text-xs text-slate-600 flex items-center justify-center font-semibold flex-shrink-0">
                  {actualRow}
                </div>
                
                {/* Cells */}
                {settings.headers.map((h, colIndex) => {
                  const entry = columnData[h][rowIndex];
                  const isSelected = selectedCell?.id === entry?.id;
                  const isRecent = recentScanId === entry?.id;
                  const isDuplicateFlash = duplicateFlashId === entry?.id;
                  
                  return (
                    <div 
                      key={`${h}-${rowIndex}`} 
                      className={`w-48 flex-shrink-0 border-b border-r border-slate-200 bg-white px-2 py-1 relative cursor-cell transition-colors
                        ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10 bg-blue-50' : ''}
                        ${isRecent ? 'bg-green-100 transition-colors duration-1000' : ''}
                        ${isDuplicateFlash ? 'bg-red-300 transition-colors duration-500' : ''}
                        ${!entry ? 'hover:bg-slate-50' : 'hover:bg-blue-50/50'}
                      `}
                      onClick={() => {
                        if (entry) handleCellClick(entry, actualRow);
                        else {
                          setSelectedCell(null);
                          onRefocusInput();
                        }
                      }}
                      id={entry ? `cell-${entry.id}` : undefined}
                    >
                      {entry ? (
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-slate-800 truncate">{entry.barcode}</span>
                          {entry.source === 'Imported' ? (
                             <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" title="Imported"></span>
                          ) : (
                             <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" title="Scanned today"></span>
                          )}
                        </div>
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
