import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const pageStr = searchParams.get("page") || "1";
  const limitStr = searchParams.get("limit") || "25";
  const search = (searchParams.get("search") || "").trim();
  const status = (searchParams.get("status") || "ALL").trim().toUpperCase();
  const company = (searchParams.get("company") || "ALL").trim();

  if (!date) {
    return NextResponse.json({ error: "DATE_REQUIRED" }, { status: 400 });
  }

  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 25));
  const skip = (page - 1) * limit;

  try {
    const where: any = {
      dispatchDate: date,
      deletedAt: null,
    };

    if (status && status !== "ALL") {
      if (status === "RTS" || status === "RTO") {
        where.status = { in: ["RTS", "RTO"] };
      } else {
        where.status = status;
      }
    }

    if (company && company !== "ALL") {
      where.company = { name: company };
    }

    if (search) {
      where.OR = [
        { barcode: { contains: search, mode: "insensitive" } },
        { barcodeNormalized: { contains: search.toUpperCase() } },
      ];
    }

    const [totalCount, scans] = await Promise.all([
      prisma.scan.count({ where }),
      prisma.scan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scannedAt: "asc" },
        select: {
          id: true,
          barcode: true,
          scannedAt: true,
          source: true,
          status: true,
          company: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const formatted = scans.map(s => ({
      id: s.id,
      barcode: s.barcode,
      column: s.company.name,
      companyId: s.company.id,
      scannedAt: s.scannedAt.toISOString(),
      source: s.source === "SCANNED" ? "Scanned" : "Imported",
      status: s.status || "DISPATCHED",
    }));

    return NextResponse.json({
      success: true,
      records: formatted,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        currentPage: page,
        limit,
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
