"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, Search, Copy, Check, AlertCircle, Ban, RotateCcw, 
  Trash2, ArrowRightLeft, FileSpreadsheet, ExternalLink 
} from 'lucide-react';
import { ScanEntry, DuplicateAttempt } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialStatus: 'CANCELLED' | 'RTO';
  date: string;
  scans: ScanEntry[];
  duplicates?: DuplicateAttempt[];
  onUpdateScanStatus: (id: string, status: 'DISPATCHED' | 'CANCELLED' | 'RTS' | 'RTO') => Promise<void>;
  onDeleteScan: (id: string) => Promise<void>;
  onViewInLog?: () => void;
}

export default function StatusBarcodesModal({
  isOpen,
  onClose,
  initialStatus,
  date,
  scans,
  duplicates = [],
  onUpdateScanStatus,
  onDeleteScan,
  onViewInLog,
}: Props) {
  const [activeTab, setActiveTab] = useState<'CANCELLED' | 'RTO'>(initialStatus);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Sync tab if initialStatus prop changes
  useEffect(() => {
    setActiveTab(initialStatus);
  }, [initialStatus]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Get all scans matching CANCELLED
  const cancelledItems = useMemo(() => {
    return scans.filter(s => s.status === 'CANCELLED');
  }, [scans]);

  // Get all scans matching RTO / RTS
  const rtoItems = useMemo(() => {
    return scans.filter(s => s.status === 'RTO' || s.status === 'RTS');
  }, [scans]);

  const activeItems = activeTab === 'CANCELLED' ? cancelledItems : rtoItems;

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return activeItems;
    const q = searchQuery.toLowerCase();
    return activeItems.filter(item => 
      item.barcode.toLowerCase().includes(q) ||
      item.column.toLowerCase().includes(q)
    );
  }, [activeItems, searchQuery]);

  // Copy all barcodes of active tab
  const handleCopyAll = () => {
    if (filteredItems.length === 0) return;
    const text = filteredItems.map(i => i.barcode).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Copy single barcode
  const handleCopySingle = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 1500);
  };

  const handleStatusChange = async (id: string, newStatus: 'DISPATCHED' | 'CANCELLED' | 'RTO') => {
    setActionLoadingId(id);
    try {
      await onUpdateScanStatus(id, newStatus);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this scan?')) return;
    setActionLoadingId(id);
    try {
      await onDeleteScan(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${
              activeTab === 'CANCELLED' 
                ? 'bg-rose-100 text-rose-700' 
                : 'bg-amber-100 text-amber-800'
            }`}>
              {activeTab === 'CANCELLED' ? <Ban className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <span>{activeTab === 'CANCELLED' ? 'Cancelled Barcodes' : 'RTO Barcodes'}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  activeTab === 'CANCELLED' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                }`}>
                  {activeItems.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Date: <span className="font-semibold text-slate-700">{date}</span> &bull; Showing all barcodes in this category
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Switcher Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-5 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('CANCELLED'); setSearchQuery(''); }}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
              activeTab === 'CANCELLED'
                ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-rose-600" />
            <span>Cancelled</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'CANCELLED' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {cancelledItems.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('RTO'); setSearchQuery(''); }}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
              activeTab === 'RTO'
                ? 'border-amber-600 text-amber-800 bg-amber-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            <span>RTO</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'RTO' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {rtoItems.length}
            </span>
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder={`Search ${activeTab.toLowerCase()} barcodes or company...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyAll}
              disabled={filteredItems.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="Copy all barcodes as a list"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copiedAll ? 'Copied All!' : `Copy All (${filteredItems.length})`}</span>
            </button>

            {onViewInLog && (
              <button
                onClick={() => { onClose(); onViewInLog(); }}
                className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors"
                title="Open in full Excel Sheet log tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View in Log</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body: Barcode List Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className={`p-4 rounded-full mb-3 ${
                activeTab === 'CANCELLED' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'
              }`}>
                {activeTab === 'CANCELLED' ? <Ban className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
              </div>
              <h3 className="text-sm font-bold text-slate-700">
                {searchQuery ? 'No matching barcodes found' : `No ${activeTab} barcodes for this date`}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {searchQuery 
                  ? 'Try checking for a typo or clearing your search filter.' 
                  : `When duplicate scans occur or items are marked as ${activeTab}, they will automatically appear here with full details.`}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Scanned Time</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredItems.map((item, index) => {
                    const timeStr = item.scannedAt 
                      ? new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '--';
                    const isLoading = actionLoadingId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">{index + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-slate-900 text-sm">{item.barcode}</span>
                            <button
                              onClick={() => handleCopySingle(item.barcode)}
                              title="Copy barcode"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors"
                            >
                              {copiedBarcode === item.barcode ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded border border-slate-200">
                            {item.column}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            item.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Switch to Dispatched */}
                            <button
                              disabled={isLoading}
                              onClick={() => handleStatusChange(item.id, 'DISPATCHED')}
                              title="Restore to Dispatched status"
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                            >
                              Restore
                            </button>

                            {/* Toggle between Cancelled and RTO */}
                            {activeTab === 'CANCELLED' ? (
                              <button
                                disabled={isLoading}
                                onClick={() => handleStatusChange(item.id, 'RTO')}
                                title="Change to RTO"
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                              >
                                Move to RTO
                              </button>
                            ) : (
                              <button
                                disabled={isLoading}
                                onClick={() => handleStatusChange(item.id, 'CANCELLED')}
                                title="Change to Cancelled"
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                              >
                                Move to Cancelled
                              </button>
                            )}

                            {/* Delete */}
                            <button
                              disabled={isLoading}
                              onClick={() => handleDelete(item.id)}
                              title="Delete permanently"
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <span className="font-semibold">Total {activeTab}: {activeItems.length} items</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
