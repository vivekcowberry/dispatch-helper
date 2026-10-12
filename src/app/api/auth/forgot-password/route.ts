import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, otp, newPassword } = body;

    const normalizedEmail = (email || "dispatch@cowberry.com").trim().toLowerCase();

    // 1. ACTION: Send OTP
    if (action === "send-otp") {
      const user = await prisma.user.findFirst({
        where: { username: normalizedEmail, active: true },
      });

      if (!user) {
        return NextResponse.json({ error: "No user found with this email address" }, { status: 404 });
      }

      // Generate secure 6-digit OTP
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Save to Setting table
      await prisma.setting.upsert({
        where: { key: `otp_${normalizedEmail}` },
        update: {
          value: {
            otp: generatedOtp,
            expiresAt,
            verified: false,
          },
        },
        create: {
          key: `otp_${normalizedEmail}`,
          value: {
            otp: generatedOtp,
            expiresAt,
            verified: false,
          },
        },
      });

      // Log email to server terminal
      console.log(`\n=============================================================`);
      console.log(`📧 [EMAIL NOTIFICATION SIMULATION]`);
      console.log(`To: ${normalizedEmail}`);
      console.log(`Subject: Dispatch Scanner - Password Reset Verification Code`);
      console.log(`-------------------------------------------------------------`);
      console.log(`Your One-Time Password (OTP) is: [ ${generatedOtp} ]`);
      console.log(`Valid for 10 minutes.`);
      console.log(`=============================================================\n`);

      return NextResponse.json({
        success: true,
        message: `OTP sent to ${normalizedEmail}`,
        previewOtp: generatedOtp, // Included for local test convenience
      });
    }

    // 2. ACTION: Verify OTP
    if (action === "verify-otp") {
      if (!otp) {
        return NextResponse.json({ error: "OTP is required" }, { status: 400 });
      }

      const setting = await prisma.setting.findUnique({
        where: { key: `otp_${normalizedEmail}` },
      });

      if (!setting || !setting.value) {
        return NextResponse.json({ error: "No active OTP found. Please request a new code." }, { status: 400 });
      }

      const otpData = setting.value as { otp: string; expiresAt: string; verified: boolean };
      const isExpired = new Date(otpData.expiresAt).getTime() < Date.now();

      if (isExpired) {
        return NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 400 });
      }

      if (otpData.otp.trim() !== otp.trim()) {
        return NextResponse.json({ error: "Invalid OTP code. Please check and try again." }, { status: 400 });
      }

      // Mark verified
      await prisma.setting.update({
        where: { key: `otp_${normalizedEmail}` },
        data: {
          value: {
            ...otpData,
            verified: true,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "OTP verified successfully. You may now enter your new password.",
      });
    }

    // 3. ACTION: Reset Password
    if (action === "reset-password") {
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }

      const setting = await prisma.setting.findUnique({
        where: { key: `otp_${normalizedEmail}` },
      });

      if (!setting || !setting.value) {
        return NextResponse.json({ error: "Unauthorized reset attempt. Please request an OTP first." }, { status: 400 });
      }

      const otpData = setting.value as { otp: string; expiresAt: string; verified: boolean };
      if (!otpData.verified) {
        return NextResponse.json({ error: "OTP has not been verified yet." }, { status: 400 });
      }

      // Hash new password with bcrypt
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update in PostgreSQL
      await prisma.user.update({
        where: { username: normalizedEmail },
        data: { passwordHash },
      });

      // Clear OTP
      await prisma.setting.delete({
        where: { key: `otp_${normalizedEmail}` },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: "Password reset successful! You can now log in with your new password.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: "Error handling request", message: err.message }, { status: 500 });
  }
}
