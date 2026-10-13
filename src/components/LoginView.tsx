"use client";

import React, { useState } from 'react';
import { 
  FileSpreadsheet, Lock, Mail, KeyRound, ArrowRight, CheckCircle2, 
  AlertCircle, Eye, EyeOff, Loader2, ShieldCheck, RefreshCw 
} from 'lucide-react';

interface Props {
  onLoginSuccess: (user: { username: string; name?: string; role?: string }) => void;
}

export default function LoginView({ onLoginSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'send' | 'verify' | 'reset' | 'success'>('send');
  const [forgotEmail, setForgotEmail] = useState('dispatch@cowberry.com');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string; previewOtp?: string } | null>(null);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid credentials');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Send OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setForgotMsg(null);
    setForgotLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-otp', email: forgotEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setForgotMsg({
        type: 'success',
        text: `OTP sent to ${forgotEmail}! Check server terminal or preview code below.`,
        previewOtp: data.previewOtp,
      });
      if (data.previewOtp) {
        setOtp(data.previewOtp);
      }
      setForgotStep('verify');
    } catch (err: any) {
      setForgotMsg({ type: 'error', text: err.message || 'Error sending OTP' });
    } finally {
      setForgotLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setForgotMsg({ type: 'error', text: 'Please enter the 6-digit OTP' });
      return;
    }

    setForgotLoading(true);
    setForgotMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-otp', email: forgotEmail.trim(), otp: otp.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid or expired OTP');
      }

      setForgotMsg({ type: 'success', text: 'OTP verified! Enter your new password below.' });
      setForgotStep('reset');
    } catch (err: any) {
      setForgotMsg({ type: 'error', text: err.message || 'Verification failed' });
    } finally {
      setForgotLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setForgotMsg({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setForgotLoading(true);
    setForgotMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset-password',
          email: forgotEmail.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setPassword(newPassword);
      setForgotStep('success');
    } catch (err: any) {
      setForgotMsg({ type: 'error', text: err.message || 'Reset failed' });
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotStep('send');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotMsg(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative overflow-hidden select-none font-sans">

      {/* ===== BACKGROUND LAYER ===== */}
      {/* Full-screen background image / logo */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url("/your-logo-or-background.jpg")',
        }}
      />

      {/* Subtle dark tint over the background so text/card stays readable */}
      <div className="absolute inset-0 bg-slate-950/50" />

      {/* Background Glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* ===== MAIN CARD (LOW OPACITY so logo shows through) ===== */}
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl p-8 z-10 bg-slate-900/40 backdrop-blur-md border border-white/10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-500/10">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white drop-shadow-lg">
            DISPATCH SCANNER
          </h1>
          <p className="text-xs text-slate-200 mt-1 font-medium drop-shadow">
            Enter credentials to access dispatch management
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center space-x-2.5 text-xs text-red-200 font-semibold animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5 drop-shadow">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                className="w-full bg-slate-950/50 backdrop-blur-sm border border-white/20 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider drop-shadow">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(true);
                  setForgotStep('send');
                  setForgotEmail(email || 'dispatch@cowberry.com');
                }}
                className="text-xs font-bold text-blue-300 hover:text-blue-200 transition-colors cursor-pointer drop-shadow"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950/50 backdrop-blur-sm border border-white/20 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-white rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none transition-all font-mono placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-blue-600/90 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60 backdrop-blur-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900/95 backdrop-blur-md border border-white/10 max-w-md w-full rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={closeForgotModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Reset Password</h2>
                <p className="text-xs text-slate-400">Verification via OTP email</p>
              </div>
            </div>

            {/* Feedback Message */}
            {forgotMsg && (
              <div className={`mb-4 p-3 rounded-xl text-xs font-semibold flex flex-col gap-1 ${
                forgotMsg.type === 'error' 
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400' 
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              }`}>
                <div className="flex items-center space-x-2">
                  {forgotMsg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{forgotMsg.text}</span>
                </div>
                {forgotMsg.previewOtp && (
                  <div className="mt-1 p-2 bg-slate-950 border border-emerald-500/40 rounded text-center">
                    <span className="text-slate-400 text-[11px]">OTP Code Preview: </span>
                    <strong className="text-emerald-300 font-mono tracking-widest text-sm">{forgotMsg.previewOtp}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Send OTP */}
            {forgotStep === 'send' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  We will send a 6-digit OTP code to verify your account identity.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={closeForgotModal}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Send OTP Code</span>}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Verify OTP */}
            {forgotStep === 'verify' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enter the 6-digit OTP sent to <strong className="text-white">{forgotEmail}</strong>:
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    6-Digit OTP Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full bg-slate-950 border-2 border-blue-500 text-white rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold tracking-widest text-center outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={forgotLoading}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Resend OTP</span>
                  </button>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep('send')}
                      className="px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading || otp.length < 6}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify OTP</span>}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Step 3: Enter New Password */}
            {forgotStep === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-xs text-slate-300">
                  OTP verified. Create your new password for <strong className="text-white">{forgotEmail}</strong>:
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 font-mono pr-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Save New Password & Continue</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 4: Success confirmation */}
            {forgotStep === 'success' && (
              <div className="text-center py-4 space-y-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Password Changed Successfully!</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Your password has been updated . You can now log in with your new password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForgotModal}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}