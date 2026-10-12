import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const dateGroups = await prisma.scan.groupBy({
      by: ['dispatchDate'],
      where: { deletedAt: null },
      _count: {
        id: true,
      },
      orderBy: {
        dispatchDate: 'desc',
      },
    });

    const dates = dateGroups.map(g => ({
      date: g.dispatchDate,
      count: g._count.id,
    }));

    return NextResponse.json(dates);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
