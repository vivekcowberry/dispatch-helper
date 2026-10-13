import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date) return NextResponse.json({ error: "DATE_REQUIRED" }, { status: 400 });

  try {
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const duplicates = await prisma.duplicateAttempt.findMany({
      where: {
        attemptedAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        attemptedCompany: true,
        existingScan: {
          include: {
            company: true,
          },
        },
      },
      orderBy: { attemptedAt: 'desc' },
    });

    const formatted = duplicates.map(d => ({
      id: d.id,
      barcode: d.barcode,
      attemptedColumn: d.attemptedCompany.name,
      existingColumn: d.existingScan?.company?.name || "Unknown",
      existingDate: d.existingScan?.dispatchDate || date,
      existingScanId: d.existingScanId,
      time: d.attemptedAt.toISOString(),
      status: d.status || d.existingScan?.status || "DETECTED",
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, existingScanId, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "ID and status are required" }, { status: 400 });
    }

    // Update DuplicateAttempt
    const updatedAttempt = await prisma.duplicateAttempt.update({
      where: { id },
      data: { status },
    });

    // If existingScanId, also update scan status
    if (existingScanId) {
      await prisma.scan.update({
        where: { id: existingScanId },
        data: { status },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, updatedAttempt });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
