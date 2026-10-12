import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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

    // Check Duplicate Check Window (Default 1)
    const setting = await prisma.setting.findUnique({ where: { key: "duplicateCheckDays" } });
    const checkDays = setting && typeof setting.value === 'number' ? (setting.value as number) : 1;

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

      // 2. Find duplicates within window
      const existingScan = await tx.scan.findFirst({
        where: {
          barcodeNormalized,
          deletedAt: null,
        },
        include: {
          company: true,
          scannedBy: { select: { name: true, username: true } }
        },
        orderBy: { scannedAt: 'desc' }
      });

      if (existingScan) {
        const scanDate = new Date(existingScan.dispatchDate).getTime();
        const currentDate = new Date(dispatchDate).getTime();
        const daysDiff = (currentDate - scanDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff < checkDays) {
          // Log duplicate attempt
          await tx.duplicateAttempt.create({
            data: {
              barcode,
              attemptedCompanyId: company.id,
              existingScanId: existingScan.id,
            }
          });
          
          return {
            error: "DUPLICATE",
            existing: {
              companyId: existingScan.company.name,
              column: existingScan.company.name,
              dispatchDate: existingScan.dispatchDate,
              scannedAt: existingScan.scannedAt,
            }
          };
        }
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
            source: "SCANNED"
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
            source: "Scanned"
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
});

export async function PATCH(req: Request) {
  try {
    const json = await req.json();
    const parsed = updateScanSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.format() }, { status: 400 });
    }

    const { id, barcode, companyId } = parsed.data;
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

    const updated = await prisma.scan.update({
      where: { id },
      data: updateData,
      include: { company: true },
    });

    return NextResponse.json({
      success: true,
      scan: {
        id: updated.id,
        barcode: updated.barcode,
        column: updated.company.name,
        scannedAt: updated.scannedAt.toISOString(),
        source: updated.source === "SCANNED" ? "Scanned" : "Imported",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

