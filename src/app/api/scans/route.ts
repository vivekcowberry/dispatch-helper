import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { resolveScanExcelLocation } from "@/lib/excel-location";

const scanSchema = z.object({
  barcode: z.string().min(1).max(100).transform(val => val.replace(/[\x00-\x1F\x7F]/g, "")),
  companyId: z.string(), // can be company ID or company Name
  dispatchDate: z.string() // expected format YYYY-MM-DD
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = scanSchema.safeParse(json);
    
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.format() }, { status: 400 });
    }

    const { barcode, companyId, dispatchDate } = parsed.data;
    const barcodeNormalized = barcode.trim().toUpperCase();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve Company
      let company = await tx.company.findFirst({
        where: {
          OR: [
            { id: companyId },
            { name: companyId }
          ]
        }
      });
      if (!company) {
        company = await tx.company.create({
          data: {
            name: companyId,
            isDefault: false
          }
        });
      }

      // 2. Find duplicates across entire database (all historical records and dates)
      const existingScan = await tx.scan.findFirst({
        where: {
          barcodeNormalized,
          deletedAt: null,
        },
        include: {
          company: true,
          scannedBy: { select: { name: true, username: true } }
        },
        orderBy: { scannedAt: 'asc' }
      });

      if (existingScan) {
        // Log duplicate attempt
        const dup = await tx.duplicateAttempt.create({
          data: {
            barcode,
            attemptedCompanyId: company.id,
            existingScanId: existingScan.id,
          }
        });

        // Resolve exact Excel location in the original date's sheet
        const location = await resolveScanExcelLocation(existingScan, tx as any);

        return {
          error: "DUPLICATE",
          duplicateAttemptId: dup.id,
          existing: {
            id: existingScan.id,
            barcode: existingScan.barcode,
            companyId: existingScan.company.name,
            column: existingScan.company.name,
            dispatchDate: existingScan.dispatchDate,
            scannedAt: existingScan.scannedAt,
            status: existingScan.status || "DISPATCHED",
            excelFileName: location.excelFileName,
            sheetName: location.sheetName,
            cellAddress: location.cellAddress,
            colLetter: location.colLetter,
            sheetRow: location.sheetRow,
            gridRow: location.gridRow,
            location,
          }
        };
      }

      // 3. Insert scan
      try {
        const newScan = await tx.scan.create({
          data: {
            barcode,
            barcodeNormalized,
            companyId: company.id,
            dispatchDate,
            scannedAt: new Date(),
            source: "SCANNED",
            status: "DISPATCHED",
          },
          include: {
            company: true
          }
        });

        return {
          success: true,
          scan: {
            id: newScan.id,
            barcode: newScan.barcode,
            column: newScan.company.name,
            scannedAt: newScan.scannedAt.toISOString(),
            source: "Scanned",
            status: newScan.status || "DISPATCHED",
          }
        };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return {
            error: "DUPLICATE_RACE",
            message: "Caught by DB constraint"
          };
        }
        throw e;
      }
    });

    if (result.error) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result, { status: 201 });

  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  
  if (!date) return NextResponse.json({ error: "DATE_REQUIRED" }, { status: 400 });

  try {
    const scans = await prisma.scan.findMany({
      where: { dispatchDate: date, deletedAt: null },
      include: {
        company: true,
      },
      orderBy: { scannedAt: 'asc' }
    });
    
    const formatted = scans.map(s => ({
      id: s.id,
      barcode: s.barcode,
      column: s.company.name,
      scannedAt: s.scannedAt.toISOString(),
      source: s.source === "SCANNED" ? "Scanned" : "Imported",
      status: s.status || "DISPATCHED",
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

  try {
    const scan = await prisma.scan.findUnique({ where: { id } });
    if (!scan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    // Hard delete: permanently remove from PostgreSQL
    await prisma.$transaction([
      prisma.duplicateAttempt.deleteMany({ where: { existingScanId: id } }),
      prisma.scan.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

const updateScanSchema = z.object({
  id: z.string(),
  barcode: z.string().min(1).max(100).transform(val => val.replace(/[\x00-\x1F\x7F]/g, "")).optional(),
  companyId: z.string().optional(),
  status: z.enum(["DISPATCHED", "CANCELLED", "Cancelled", "RTS", "RTO"]).optional(),
  duplicateAttemptId: z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    const json = await req.json();
    const parsed = updateScanSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.format() }, { status: 400 });
    }

    const { id, barcode, companyId, status, duplicateAttemptId } = parsed.data;
    const scan = await prisma.scan.findUnique({ where: { id } });
    if (!scan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const updateData: any = {};
    if (barcode) {
      const barcodeNormalized = barcode.trim().toUpperCase();
      // Check if duplicate with another active scan
      const duplicate = await prisma.scan.findFirst({
        where: {
          barcodeNormalized,
          deletedAt: null,
          id: { not: id },
        },
        include: { company: true },
      });
      if (duplicate) {
        return NextResponse.json({
          error: "DUPLICATE",
          message: `Barcode already exists in ${duplicate.company.name}`,
        }, { status: 409 });
      }
      updateData.barcode = barcode;
      updateData.barcodeNormalized = barcodeNormalized;
    }

    if (companyId) {
      let company = await prisma.company.findFirst({
        where: { OR: [{ id: companyId }, { name: companyId }] },
      });
      if (!company) {
        company = await prisma.company.create({ data: { name: companyId, isDefault: false } });
      }
      updateData.companyId = company.id;
    }

    if (status) {
      const normalizedStatus = status === "Cancelled" ? "CANCELLED" : status;
      updateData.status = normalizedStatus;
    }

    // Update scan
    const updated = await prisma.scan.update({
      where: { id },
      data: updateData,
      include: { company: true },
    });

    // If duplicateAttemptId provided, update that too
    if (duplicateAttemptId && status) {
      await prisma.duplicateAttempt.update({
        where: { id: duplicateAttemptId },
        data: { status: updateData.status || status },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      scan: {
        id: updated.id,
        barcode: updated.barcode,
        column: updated.company.name,
        scannedAt: updated.scannedAt.toISOString(),
        source: updated.source === "SCANNED" ? "Scanned" : "Imported",
        status: updated.status || "DISPATCHED",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

