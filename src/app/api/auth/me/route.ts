import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dispatch-cowberry-auth-secret-key-2025";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string };
      return NextResponse.json({
        authenticated: true,
        user: {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role,
        },
      });
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
  } catch (err: any) {
    return NextResponse.json({ authenticated: false, error: err.message }, { status: 500 });
  }
}
