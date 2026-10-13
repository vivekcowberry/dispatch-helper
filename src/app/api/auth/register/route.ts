import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, username, password, name, role } = body;

    const userIdentifier = (email || username || "").trim().toLowerCase();

    if (!userIdentifier) {
      return NextResponse.json({ error: "Email or username is required" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: { username: userIdentifier },
    });

    if (existing) {
      return NextResponse.json({ error: "User already exists with this email/username" }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const userRole = role === "ADMIN" ? "ADMIN" : "OPERATOR";

    const newUser = await prisma.user.create({
      data: {
        username: userIdentifier,
        name: name || null,
        passwordHash,
        role: userRole,
        active: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "User created successfully",
      user: newUser,
    }, { status: 201 });

  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create user", message: err.message }, { status: 500 });
  }
}
