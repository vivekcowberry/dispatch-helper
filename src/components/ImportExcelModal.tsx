"use client";

import React, { useState, useRef } from 'react';
import { 
  X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  AlertCircle, Loader2, ArrowRight, Calendar, Building2, Check, FileUp
} from 'lucide-react';
import { formatFileDate } from '@/lib/date';
import { playSuccessSound, playErrorSound } from '@/lib/sound';

interface ValidationResult {
  dispatchDate: string;
  detectedLayout?: "COMPANY_COLUMNS" | "STANDARD_TABLE";
  detectedCompanies?: string[];
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  inFileDuplicatesCount: number;
  databaseDuplicatesCount: number;
  newEligibleCount: number;
  databaseDuplicates: Array<{
    barcode: string;
    rowNumber: number;
    column?: string;
    existingDate: string;
    existingCompany: string;
    existingStatus: string;
  }>;
  inFileDuplicates: Array<{
    barcode: string;
    firstRow: number;
    duplicateRow: number;
    column?: string;
  }>;
  errors: Array<{
    rowNumber: number;
    column?: string;
    barcode?: string;
    reason: string;
  }>;
  eligibleRecords: Array<{
    rowNumber: number;
    column?: string;
    barcode: string;
    company: string;
    status: string;
  }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeDate: string;
  onImportComplete: (date: string) => void;
}

export default function ImportExcelModal({
  isOpen,
  onClose,
  activeDate,
  onImportComplete,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(activeDate);
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [importSummary, setImportSummary] = useState<{ importedCount: number; skippedCount: number; date: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setValidationResult(null);
      setImportSummary(null);
      setErrorMsg(null);
    }
  };

  const handleValidate = async () => {
    if (!file) {
      setErrorMsg("Please select an Excel file (.xlsx) to upload.");
      return;
    }

    setIsValidating(true);
    setErrorMsg(null);
    setValidationResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dispatchDate", selectedDate);

    try {
      const res = await fetch("/api/import/validate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to validate Excel file");
      }

      setValidationResult(data);
      if (data.newEligibleCount > 0) {
        playSuccessSound();
      } else {
        playErrorSound();
      }
    } catch (err: any) {
      playErrorSound();
      setErrorMsg(err.message || "Error validating file.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!validationResult || validationResult.eligibleRecords.length === 0) return;

    setIsConfirming(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchDate: selectedDate,
          records: validationResult.eligibleRecords.map(r => ({
            barcode: r.barcode,
            company: r.company,
            status: r.status,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to complete import");
      }

      playSuccessSound();
      setImportSummary({
        importedCount: data.importedCount,
        skippedCount: data.skippedCount,
        date: selectedDate,
      });
      onImportComplete(selectedDate);
    } catch (err: any) {
      playErrorSound();
      setErrorMsg(err.message || "Failed to import records.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setValidationResult(null);
    setImportSummary(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200 select-none font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border-2 border-slate-700 max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden relative text-white max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800/90 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">Import Excel Data</h2>
              <p className="text-xs text-slate-400 font-medium">Bulk upload barcodes directly below company headers</p>
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

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Date & Sample Template Header Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Target Dispatch Date:</span>
              </label>
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={isValidating || isConfirming || !!importSummary}
                className="w-full bg-slate-800 border border-slate-700 text-white font-bold text-xs px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Records will be assigned to {formatFileDate(selectedDate)}
              </span>
            </div>

            <div className="flex flex-col justify-between">
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Need the website template?</span>
              </label>
              <a
                href="/api/import/template"
                download
                className="flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download Template (Company Headers)</span>
              </a>
              <span className="text-[10px] text-slate-400 block mt-1">
                Row 1 contains company headers only; paste barcodes below companies
              </span>
            </div>
          </div>

          {/* Success Summary View */}
          {importSummary ? (
            <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-5 text-center space-y-3 animate-in fade-in">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-white">Import Completed Successfully!</h3>
              <p className="text-xs text-slate-300">
                <strong className="text-emerald-400 text-sm font-black">{importSummary.importedCount}</strong> new barcodes were imported for date <strong className="text-white">{formatFileDate(importSummary.date)}</strong>.
                {importSummary.skippedCount > 0 && (
                  <span className="block text-slate-400 text-[11px] mt-1">
                    ({importSummary.skippedCount} duplicate/invalid records were safely skipped).
                  </span>
                )}
              </p>
              <div className="pt-2 flex justify-center space-x-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Import Another File
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black shadow-md transition-colors cursor-pointer"
                >
                  View In Excel Sheet
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 2: File Upload Zone */}
              <div className="bg-slate-950/40 border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-5 text-center transition-colors">
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={handleFileChange}
                  className="hidden" 
                  id="excel-file-upload" 
                />
                <label 
                  htmlFor="excel-file-upload" 
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-blue-400 hover:underline">
                      {file ? file.name : "Click to select Excel file"}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Accepts .xlsx or .xls files with company headers in Row 1
                    </p>
                  </div>
                </label>

                {file && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-center space-x-3">
                    <button
                      onClick={handleValidate}
                      disabled={isValidating}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Validating File & Database Duplicates...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Validate & Preview Records</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleReset}
                      className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 3: Validation Preview & Confirmation */}
              {validationResult && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Format pill badge */}
                  {validationResult.detectedCompanies && validationResult.detectedCompanies.length > 0 && (
                    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-400 font-bold text-[11px] mr-1">Detected Companies:</span>
                      {validationResult.detectedCompanies.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-blue-900/40 border border-blue-500/30 text-blue-300 font-mono text-[11px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                      <span className="text-slate-400 font-semibold block text-[10px]">TOTAL BARCODES</span>
                      <strong className="text-white text-base font-black">{validationResult.totalRows}</strong>
                    </div>

                    <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/40">
                      <span className="text-emerald-400 font-semibold block text-[10px]">ELIGIBLE NEW</span>
                      <strong className="text-emerald-300 text-base font-black">{validationResult.newEligibleCount}</strong>
                    </div>

                    <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-500/40">
                      <span className="text-amber-400 font-semibold block text-[10px]">DB DUPLICATES</span>
                      <strong className="text-amber-300 text-base font-black">{validationResult.databaseDuplicatesCount}</strong>
                    </div>

                    <div className="bg-rose-950/40 p-3 rounded-xl border border-rose-500/40">
                      <span className="text-rose-400 font-semibold block text-[10px]">INVALID / ERRORS</span>
                      <strong className="text-rose-300 text-base font-black">{validationResult.invalidRowsCount}</strong>
                    </div>
                  </div>

                  {/* Database Duplicates Details */}
                  {validationResult.databaseDuplicatesCount > 0 && (
                    <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center space-x-2 text-amber-400 font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Database Duplicates Detected ({validationResult.databaseDuplicatesCount}) - Will be skipped</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto divide-y divide-slate-800 text-[11px] text-slate-300">
                        {validationResult.databaseDuplicates.slice(0, 10).map((dup, idx) => (
                          <div key={idx} className="py-1 flex items-center justify-between">
                            <span className="font-mono font-bold text-amber-300">{dup.barcode}</span>
                            <span className="text-slate-400">
                              {dup.column ? `[${dup.column}] Row ${dup.rowNumber} • ` : `Row ${dup.rowNumber} • `}
                              Already exists in {formatFileDate(dup.existingDate)} ({dup.existingCompany})
                            </span>
                          </div>
                        ))}
                        {validationResult.databaseDuplicatesCount > 10 && (
                          <div className="py-1 text-slate-400 italic text-center">
                            ... and {validationResult.databaseDuplicatesCount - 10} more existing duplicates
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Format Errors List */}
                  {validationResult.errors.length > 0 && (
                    <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center space-x-2 text-rose-400 font-bold">
                        <AlertCircle className="w-4 h-4" />
                        <span>Validation Issues ({validationResult.errors.length})</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto divide-y divide-slate-800 text-[11px] text-slate-300">
                        {validationResult.errors.slice(0, 8).map((err, idx) => (
                          <div key={idx} className="py-1 flex items-center justify-between">
                            <span className="text-rose-300">
                              {err.column ? `[${err.column}] ` : ''}Row {err.rowNumber}: {err.reason}
                            </span>
                            {err.barcode && <span className="font-mono text-slate-400">{err.barcode}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirmation Action */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                    <span className="text-xs text-slate-400 font-medium">
                      Ready to insert <strong className="text-white font-bold">{validationResult.newEligibleCount}</strong> records to <strong className="text-white">{formatFileDate(selectedDate)}</strong>
                    </span>

                    <button
                      onClick={handleConfirmImport}
                      disabled={isConfirming || validationResult.newEligibleCount === 0}
                      className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isConfirming ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Importing Records...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm Import ({validationResult.newEligibleCount})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
