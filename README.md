# Dispatch Scanner (Full-Stack Next.js + PostgreSQL + ExcelJS)

An enterprise-ready barcode scanning web app designed for high-throughput warehouse dispatch operations. Scans barcodes directly into company columns (*Delhivery, Amazon, Instamart, CRED, Flipkart, Blinkit + Custom*), displays a live on-screen spreadsheet view, blocks cross-date duplicates, supports offline buffering, and generates multi-sheet Excel exports.

---

## Quick Start

### 1. Configure Database (.env)
Edit your [`.env`](.env) file:
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```
*(See [SETUP.md](SETUP.md) for step-by-step setup using free Neon PostgreSQL or local Windows PostgreSQL)*

### 2. Setup Database Schema & Seed
```powershell
npm run db:push
npm run db:seed
```

### 3. Run Development Server
```powershell
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Key Features
- **Live Spreadsheet View**: Real Excel-like grid visible at all times showing scanned barcodes organized by company.
- **Instant Duplicate Prevention**: Detects duplicate barcodes across current and past dates within configurable lookback windows with audio and visual alerts.
- **Offline Resilience**: Automatically caches scans in IndexedDB if disconnected and auto-syncs when online.
- **Date Navigation**: Filter by date with quick buttons (*Today, Yesterday, Prev/Next*) and a dropdown of saved scan days.
- **ExcelJS Export**: Server-side multi-sheet Excel export (*Dispatch Sheet, Summary, Scan Log, Duplicate Attempts*).
- **JSON Backup**: Download full sanitized backups with one click.
- **Keyboard Shortcuts**: Number keys `1-9` switch columns instantly; auto-refocus returns cursor to the scanner input on any interaction.
