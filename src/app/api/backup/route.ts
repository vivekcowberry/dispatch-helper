import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {

  try {
    const [companies, scans, duplicates, settings, users] = await Promise.all([
      prisma.company.findMany(),
      prisma.scan.findMany({ include: { company: true } }),
      prisma.duplicateAttempt.findMany(),
      prisma.setting.findMany(),
      prisma.user.findMany({
        select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
      }),
    ]);

    const backupData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      stats: {
        companiesCount: companies.length,
        scansCount: scans.length,
        duplicatesCount: duplicates.length,
      },
      companies,
      scans,
      duplicateAttempts: duplicates,
      settings,
      users,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="dispatch-backup-${dateStr}.json"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
