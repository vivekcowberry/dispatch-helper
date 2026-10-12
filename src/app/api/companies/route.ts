import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createCompanySchema = z.object({
  name: z.string().min(1).max(50).trim(),
});

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(companies);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = createCompanySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.format() }, { status: 400 });
    }

    const { name } = parsed.data;

    // Get max sort order
    const lastCompany = await prisma.company.findFirst({
      orderBy: { sortOrder: 'desc' },
    });
    const nextOrder = (lastCompany?.sortOrder ?? 0) + 1;

    const company = await prisma.company.upsert({
      where: { name },
      update: { active: true },
      create: {
        name,
        sortOrder: nextOrder,
        isDefault: false,
        active: true,
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
