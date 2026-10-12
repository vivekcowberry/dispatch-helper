# Local Database & Application Setup Guide

This guide covers everything needed to set up the database and run the **Dispatch Scanner** locally on your machine.

---

## Prerequisites
- **Node.js** (v18.18+ or v20+)
- **npm** (included with Node.js)

---

## Step 1: Configure Environment Variables

Open or create the [`.env`](file:///c:/Users/DELL/Desktop/excel-export/.env) file in the project root directory.

Choose **one** of the two database options below:

---

### Option A: Free Neon PostgreSQL (Recommended — 2 Minutes, Zero Install)
Since your computer does not require running a heavy local database service, Neon provides a free, instant cloud PostgreSQL database:

1. Go to **[https://neon.tech](https://neon.tech)** and sign up (Free).
2. Click **Create Project** (Name: `dispatch-db`).
3. Neon will display your **Connection Details**.
4. Copy the connection string and paste it into [`.env`](file:///c:/Users/DELL/Desktop/excel-export/.env):

```env
DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-sample.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

---

### Option B: Local PostgreSQL on Windows (Offline)

If you prefer to run PostgreSQL directly on your Windows PC:

#### 1. Install PostgreSQL
Open PowerShell as Administrator and run:
```powershell
winget install PostgreSQL.PostgreSQL
```
*(Or download the installer from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/))*

During installation:
- Remember the `postgres` user password you set (e.g. `postgres` or `admin123`).
- Keep the default port: `5432`.

#### 2. Create the Database
Open **SQL Shell (psql)** or run in PowerShell:
```powershell
psql -U postgres -c "CREATE DATABASE dispatch_db;"
```

#### 3. Update `.env`
Update [`.env`](file:///c:/Users/DELL/Desktop/excel-export/.env) with your local password:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/dispatch_db?schema=public"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/dispatch_db?schema=public"
```

---

## Step 2: Push Database Schema & Seed Data

Once your `.env` connection string is set, run these commands in your project terminal:

### 1. Push Database Tables
Creates all tables (`Scan`, `Company`, `DuplicateAttempt`, `Setting`, `AuditLog`) in your database:
```powershell
npm run db:push
```

### 2. Seed Default Companies & Settings
Populates the default company columns (*Delhivery, Amazon, Instamart, CRED, Flipkart, Blinkit*) and duplicate check settings:
```powershell
npm run db:seed
```

---

## Step 3: Run the Application

Start the local development server:
```powershell
npm run dev
```

Open your browser to:
👉 **[http://localhost:3000](http://localhost:3000)**

The app will load directly into the live Dispatch Scanner with no login barrier.

---

## Useful Command Reference

| Action | Command |
| :--- | :--- |
| **Start Dev Server** | `npm run dev` |
| **Build for Production** | `npm run build` |
| **Start Production Server** | `npm start` |
| **Generate Prisma Client** | `npx prisma generate` |
| **Push Schema to Database** | `npm run db:push` |
| **Run Database Migrations** | `npm run db:migrate` |
| **Seed Initial Data** | `npm run db:seed` |
| **Open Prisma Database GUI Studio** | `npx prisma studio` |

---

## Tip: Visual Database Management (Prisma Studio)
To view and edit your database rows in an interactive visual web interface:
```powershell
npx prisma studio
```
This opens **`http://localhost:5555`** where you can view every scan, duplicate attempt, and company record in real time.
