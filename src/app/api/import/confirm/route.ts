import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const importConfirmSchema = z.object({
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(
    z.object({
      barcode: z.string().min(1),
      company: z.string().min(1),
      status: z.enum(["DISPATCHED", "CANCELLED", "RTS", "RTO"]).optional(),
    })
  ).min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = importConfirmSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.format() }, { status: 400 });
    }

    const { dispatchDate, records } = parsed.data;

    // 1. Resolve or create companies
    const uniqueCompanyNames = Array.from(new Set(records.map(r => r.company.trim())));
    const existingCompanies = await prisma.company.findMany({
      where: { name: { in: uniqueCompanyNames } },
    });

    const companyMap = new Map<string, string>();
    existingCompanies.forEach(c => companyMap.set(c.name.toLowerCase(), c.id));

    // Create any missing company
    for (const name of uniqueCompanyNames) {
      if (!companyMap.has(name.toLowerCase())) {
        const created = await prisma.company.create({
          data: {
            name,
            isDefault: false,
          },
        });
        companyMap.set(name.toLowerCase(), created.id);
      }
    }

    // 2. Perform duplicate check in database to avoid race conditions
    const normalizedBarcodes = records.map(r => r.barcode.trim().toUpperCase());
    const existingScans = await prisma.scan.findMany({
      where: {
        barcodeNormalized: { in: normalizedBarcodes },
        deletedAt: null,
      },
      select: { barcodeNormalized: true },
    });
    const existingSet = new Set(existingScans.map(s => s.barcodeNormalized));

    const recordsToInsert = records.filter(r => !existingSet.has(r.barcode.trim().toUpperCase()));

    if (recordsToInsert.length === 0) {
      return NextResponse.json({
        success: false,
        importedCount: 0,
        skippedCount: records.length,
        message: "All records already exist in the database.",
      });
    }

    // 3. Batch insert in transactions (batch size 500)
    const BATCH_SIZE = 500;
    let totalImported = 0;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
        const data = batch.map((r, idx) => {
          const companyId = companyMap.get(r.company.trim().toLowerCase())!;
          const barcode = r.barcode.trim();
          // Offset timestamps slightly within the batch to preserve imported order
          const itemScannedAt = new Date(now.getTime() + (i + idx) * 100);

          return {
            barcode,
            barcodeNormalized: barcode.toUpperCase(),
            companyId,
            dispatchDate,
            scannedAt: itemScannedAt,
            source: "IMPORTED" as const,
            status: r.status || "DISPATCHED",
          };
        });

        await tx.scan.createMany({
          data,
          skipDuplicates: true,
        });

        totalImported += batch.length;
      }
    });

    // 4. Audit Log after transaction commit
    const defaultUser = await prisma.user.findFirst({ select: { id: true } });
    if (defaultUser) {
      await prisma.auditLog.create({
        data: {
          userId: defaultUser.id,
          action: "EXCEL_BULK_IMPORT",
          details: {
            dispatchDate,
            importedCount: totalImported,
            skippedDuplicatesCount: records.length - recordsToInsert.length,
          },
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      importedCount: totalImported,
      skippedCount: records.length - recordsToInsert.length,
      dispatchDate,
    });

  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
