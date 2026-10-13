"use client";

import React from 'react';
import { AlertTriangle, Ban, RotateCcw, X, Clock, Building, Calendar, CheckCircle2 } from 'lucide-react';

export interface DuplicateModalData {
  barcode: string;
  attemptedCompany: string;
  existingScanId: string;
  existingCompany: string;
  existingDate: string;
  existingScannedAt?: string;
  duplicateAttemptId?: string;
}

interface Props {
  data: DuplicateModalData | null;
  onClose: () => void;
  onMarkStatus: (status: 'CANCELLED' | 'RTO') => void;
  isLoading?: boolean;
}

export default function DuplicateModal({ data, onClose, onMarkStatus, isLoading }: Props) {
  if (!data) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 select-none font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border-2 border-amber-500/60 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-amber-500/20 border-b border-amber-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">DUPLICATE ENTRY DETECTED</h2>
              <p className="text-xs text-amber-300 font-semibold">This barcode was already scanned earlier</p>
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
        <div className="p-6 space-y-5">
          {/* Barcode Display */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              SCANNED BARCODE
            </span>
            <span className="text-2xl font-black font-mono text-amber-400 tracking-wider">
              {data.barcode}
            </span>
          </div>

          {/* Conflict Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
              <span className="text-slate-400 font-bold block mb-1">CURRENT ATTEMPT</span>
              <div className="flex items-center space-x-1.5 text-amber-300 font-bold text-sm">
                <Building className="w-4 h-4 shrink-0" />
                <span>{data.attemptedCompany}</span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3">
              <span className="text-slate-400 font-bold block mb-1">ORIGINAL SCAN</span>
              <div className="flex items-center space-x-1.5 text-blue-400 font-bold text-sm">
                <Building className="w-4 h-4 shrink-0" />
                <span>{data.existingCompany}</span>
              </div>
              <div className="flex items-center space-x-1 text-slate-400 text-[11px] mt-1 font-medium">
                <Calendar className="w-3 h-3" />
                <span>Date: {data.existingDate}</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            How would you like to handle this duplicate scan? Choose an action below:
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => onMarkStatus('CANCELLED')}
              disabled={isLoading}
              className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Ban className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="text-xs tracking-wider uppercase font-black">MARK CANCELLED</div>
                <div className="text-[10px] text-red-200 font-normal">Order cancelled by user</div>
              </div>
            </button>

            <button
              onClick={() => onMarkStatus('RTO')}
              disabled={isLoading}
              className="flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <div className="text-xs tracking-wider uppercase font-black">MARK RTO</div>
                <div className="text-[10px] text-amber-200 font-normal">Return To Origin package</div>
              </div>
            </button>
          </div>

          {/* Dismiss button */}
          <div className="text-center pt-1">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white font-bold transition-colors cursor-pointer py-1 px-3 rounded-lg hover:bg-slate-800"
            >
              Ignore & Keep Dispatched
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
