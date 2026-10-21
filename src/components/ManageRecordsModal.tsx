"use client";

import React, { useState, useEffect } from 'react';
import { 
  X, Search, Filter, Calendar, Edit3, Check, Trash2, Ban, 
  RotateCcw, CheckCircle2, ChevronLeft, ChevronRight, Loader2, 
  RefreshCw, Building, AlertCircle
} from 'lucide-react';
import { formatFileDate } from '@/lib/date';
import { playSuccessSound, playErrorSound } from '@/lib/sound';

export interface ScanRecordItem {
  id: string;
  barcode: string;
  column: string;
  companyId?: string;
  scannedAt: string;
  source: string;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeDate: string;
  companies: string[];
  onRecordsChanged: () => void;
}

export default function ManageRecordsModal({
  isOpen,
  onClose,
  activeDate,
  companies,
  onRecordsChanged,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(activeDate);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(25);

  const [records, setRecords] = useState<ScanRecordItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBarcode, setEditBarcode] = useState<string>('');
  const [editCompany, setEditCompany] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('DISPATCHED');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Keep selectedDate in sync with activeDate on open
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(activeDate);
      setPage(1);
    }
  }, [isOpen, activeDate]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch paginated records from server
  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        page: page.toString(),
        limit: limit.toString(),
        search: debouncedSearch,
        status: statusFilter,
        company: companyFilter,
      });

      const res = await fetch(`/api/scans/manage?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load records");

      setRecords(data.records || []);
      setTotalCount(data.pagination?.totalCount || 0);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || "Error fetching records." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecords();
    }
  }, [isOpen, selectedDate, debouncedSearch, statusFilter, companyFilter, page]);

  if (!isOpen) return null;

  const startEdit = (item: ScanRecordItem) => {
    setEditingId(item.id);
    setEditBarcode(item.barcode);
    setEditCompany(item.column);
    setEditStatus(item.status || 'DISPATCHED');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    const trimmed = editBarcode.trim();
    if (!trimmed) {
      setStatusMsg({ type: 'error', text: "Barcode cannot be empty" });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/scans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          barcode: trimmed,
          companyId: editCompany,
          status: editStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update record");
      }

      playSuccessSound();
      setStatusMsg({ type: 'success', text: `Record ${trimmed} updated successfully.` });
      setTimeout(() => setStatusMsg(null), 3000);
      setEditingId(null);
      fetchRecords();
      onRecordsChanged();
    } catch (err: any) {
      playErrorSound();
      setStatusMsg({ type: 'error', text: err.message || "Update failed." });
    } finally {
      setIsSaving(false);
    }
  };

  const updateQuickStatus = async (id: string, newStatus: 'DISPATCHED' | 'CANCELLED' | 'RTS') => {
    try {
      const res = await fetch("/api/scans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update status");

      playSuccessSound();
      fetchRecords();
      onRecordsChanged();
    } catch (err: any) {
      playErrorSound();
      setStatusMsg({ type: 'error', text: err.message || "Status change failed." });
    }
  };

  const handleDelete = async (id: string, barcode: string) => {
    if (!confirm(`Are you sure you want to delete barcode "${barcode}"?`)) return;

    try {
      const res = await fetch(`/api/scans?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      playSuccessSound();
      fetchRecords();
      onRecordsChanged();
    } catch (err: any) {
      playErrorSound();
      setStatusMsg({ type: 'error', text: err.message || "Delete failed." });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200 select-none font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border-2 border-slate-700 max-w-5xl w-full rounded-2xl shadow-2xl overflow-hidden relative text-white max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-400 flex items-center justify-center shrink-0">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">Manage Date-Wise Data</h2>
              <p className="text-xs text-slate-400 font-medium">Search, filter, edit, and organize records with server-side pagination</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
            {/* Date Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
              />
            </div>

            {/* Search Barcode */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 font-medium outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
              />
            </div>

            {/* Company Filter */}
            <select
              value={companyFilter}
              onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
              className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none cursor-pointer font-semibold"
            >
              <option value="ALL">All Companies</option>
              {companies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Status Filter Tabs */}
            <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              {['ALL', 'DISPATCHED', 'CANCELLED', 'RTS'].map(st => (
                <button
                  key={st}
                  onClick={() => { setStatusFilter(st); setPage(1); }}
                  className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    statusFilter === st ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-400">
              Total: <strong className="text-white">{totalCount}</strong> records
            </span>
            <button
              onClick={fetchRecords}
              title="Refresh records"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {statusMsg && (
          <div className={`px-4 py-2 text-xs font-bold flex items-center space-x-2 ${
            statusMsg.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-500/40' : 'bg-red-950/80 text-red-300 border-b border-red-500/40'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Records Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && records.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
              <p className="text-xs font-bold text-slate-400">Loading records for {formatFileDate(selectedDate)}...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              No records match your filter criteria for {formatFileDate(selectedDate)}.
            </div>
          ) : (
            <div className="border border-slate-700/80 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-slate-300 font-bold border-b border-slate-700">
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3">Scanned Time</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-medium">
                  {records.map((item, idx) => {
                    const isEditing = editingId === item.id;
                    const rowNumber = (page - 1) * limit + idx + 1;
                    const statusUpper = (item.status || 'DISPATCHED').toUpperCase();

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-500 font-bold">{rowNumber}</td>
                        
                        {/* Barcode Column */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <input 
                              type="text"
                              value={editBarcode}
                              onChange={(e) => setEditBarcode(e.target.value)}
                              className="bg-slate-800 border border-blue-500 px-2 py-1 rounded text-xs font-mono font-bold text-white outline-none w-48"
                              autoFocus
                            />
                          ) : (
                            <span className={`font-mono font-bold text-sm ${
                              statusUpper === 'CANCELLED' ? 'line-through text-red-400' : statusUpper === 'RTS' ? 'text-amber-300' : 'text-white'
                            }`}>
                              {item.barcode}
                            </span>
                          )}
                        </td>

                        {/* Company Column */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <select
                              value={editCompany}
                              onChange={(e) => setEditCompany(e.target.value)}
                              className="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs text-white outline-none"
                            >
                              {companies.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded border border-slate-700">
                              {item.column}
                            </span>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs text-white font-bold outline-none"
                            >
                              <option value="DISPATCHED">DISPATCHED</option>
                              <option value="CANCELLED">CANCELLED</option>
                              <option value="RTS">RTS</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              statusUpper === 'CANCELLED'
                                ? 'bg-red-950 text-red-300 border border-red-500/40'
                                : statusUpper === 'RTS' || statusUpper === 'RTO'
                                ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            }`}>
                              {statusUpper}
                            </span>
                          )}
                        </td>

                        {/* Source Column */}
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {item.source}
                        </td>

                        {/* Scanned Time */}
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {new Date(item.scannedAt).toLocaleTimeString()}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => saveEdit(item.id)}
                                disabled={isSaving}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                              >
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end space-x-1">
                              {/* Quick RTS toggle */}
                              <button
                                onClick={() => updateQuickStatus(item.id, 'RTS')}
                                title="Mark RTS"
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                  statusUpper === 'RTS' ? 'bg-amber-600 text-white border-amber-500' : 'bg-amber-950/60 text-amber-400 hover:bg-amber-900 border-amber-700/60'
                                }`}
                              >
                                RTS
                              </button>

                              {/* Quick Cancelled toggle */}
                              <button
                                onClick={() => updateQuickStatus(item.id, 'CANCELLED')}
                                title="Mark Cancelled"
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                  statusUpper === 'CANCELLED' ? 'bg-red-600 text-white border-red-500' : 'bg-red-950/60 text-red-400 hover:bg-red-900 border-red-700/60'
                                }`}
                              >
                                Cancel
                              </button>

                              {/* Edit details */}
                              <button
                                onClick={() => startEdit(item)}
                                title="Edit Barcode, Company or Status"
                                className="p-1 hover:bg-slate-700 text-blue-400 rounded transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(item.id, item.barcode)}
                                title="Delete Scan"
                                className="p-1 hover:bg-red-950/60 text-red-400 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>
            Showing page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong> ({totalCount} total)
          </span>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 font-mono font-bold text-white">
              {page}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
