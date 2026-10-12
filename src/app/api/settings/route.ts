import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, any> = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    return NextResponse.json(settingsMap);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}

const updateSettingSchema = z.object({
  key: z.string(),
  value: z.any(),
});

export async function POST(req: Request) {

  try {
    const json = await req.json();
    const parsed = updateSettingSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    const { key, value } = parsed.data;
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json(setting);
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: err.message }, { status: 500 });
  }
}
