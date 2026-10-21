"use client";

import React from 'react';
import { AlertTriangle, Ban, RotateCcw, X, Calendar, Building, FileSpreadsheet, MapPin, Download } from 'lucide-react';
import { formatFileDate } from '@/lib/date';

export interface DuplicateModalData {
  barcode: string;
  attemptedCompany: string;
  existingScanId: string;
  existingCompany: string;
  existingDate: string;
  existingScannedAt?: string;
  duplicateAttemptId?: string;
  excelFileName?: string;
  sheetName?: string;
  cellAddress?: string;
  gridRow?: number;
}

interface Props {
  data: DuplicateModalData | null;
  onClose: () => void;
  onMarkStatus: (status: 'RTS' | 'CANCELLED') => void;
  isLoading?: boolean;
}

export default function DuplicateModal({ data, onClose, onMarkStatus, isLoading }: Props) {
  if (!data) return null;

  const displayDate = formatFileDate(data.existingDate);

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200 select-none font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border-2 border-amber-500/70 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden relative text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">Duplicate Barcode Found</h2>
              <p className="text-xs text-amber-300 font-medium">Navigated to historical record</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Dismiss (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Main User Message */}
          <div className="text-sm font-semibold text-slate-200 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-center">
            This barcode already exists in the database. Please select the appropriate action.
          </div>

          {/* Barcode Display */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
              SCANNED BARCODE
            </span>
            <span className="text-2xl font-black font-mono text-amber-400 tracking-wider">
              {data.barcode}
            </span>
          </div>

          {/* Excel Navigation / Cell Location Details */}
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="text-[11px] font-black uppercase text-blue-400 tracking-wider flex items-center justify-between">
              <span>Original Excel Record Location</span>
              {data.cellAddress && (
                <span className="bg-blue-600 text-white font-mono px-2 py-0.5 rounded text-[11px] font-bold shadow-xs">
                  Cell: {data.cellAddress}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div className="flex items-center space-x-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Scan Date</span>
                  <strong className="text-white text-xs">{displayDate}</strong>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <Building className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Company / Column</span>
                  <strong className="text-white text-xs">{data.existingCompany}</strong>
                </div>
              </div>
            </div>

            {data.excelFileName && (
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-slate-200 font-bold block truncate">{data.excelFileName}</span>
                    <span className="text-[11px] text-slate-400">Sheet: {data.sheetName || 'Dispatch'}</span>
                  </div>
                </div>

                <a
                  href={`/api/export?date=${data.existingDate}`}
                  download
                  title="Download historical Excel file"
                  className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-bold transition-colors shrink-0 ml-2"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .xlsx</span>
                </a>
              </div>
            )}
          </div>

          {/* Action Buttons: RTS and Cancelled */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* RTS Button */}
            <button
              type="button"
              onClick={() => onMarkStatus('RTS')}
              disabled={isLoading}
              className="flex items-center justify-center space-x-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="text-sm tracking-wider font-black uppercase">RTS</div>
                <div className="text-[10px] text-amber-200 font-normal">Return To Seller</div>
              </div>
            </button>

            {/* Cancelled Button */}
            <button
              type="button"
              onClick={() => onMarkStatus('CANCELLED')}
              disabled={isLoading}
              className="flex items-center justify-center space-x-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Ban className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="text-sm tracking-wider font-black uppercase">Cancelled</div>
                <div className="text-[10px] text-rose-200 font-normal">Mark order cancelled</div>
              </div>
            </button>
          </div>

          {/* Dismiss button */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer py-1 px-3 rounded-lg hover:bg-slate-800"
            >
              Keep As Dispatched / Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
