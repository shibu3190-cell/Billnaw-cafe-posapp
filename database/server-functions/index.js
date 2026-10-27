/**
 * database/server-functions/index.js
 * Firebase Cloud Functions / Serverless Endpoints for Billnaw Cafe POS.
 * Keeps SMTP credentials, Google Sheets webhook secrets, and Gemini keys strictly on the server.
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const otpMemoryCache = new Map();

/**
 * Normalizes email address.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Dispatches 6-digit verification code via Gmail SMTP or Resend API.
 * @param {Object} req - { email, purpose }
 * @param {Object} env - { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function handleSendOtp(req, env) {
  const email = normalizeEmail(req.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Invalid email address provided.' };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedOtp = crypto.createHash('sha256').update(otp + salt).digest('hex');

  otpMemoryCache.set(email, {
    hashedOtp,
    salt,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0
  });

  const isSignup = req.purpose === 'signup';
  const actionText = isSignup ? 'verify your cafe shop registration' : 'sign in to your counter terminal';

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(env.SMTP_PORT || '587', 10),
    secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: env.SMTP_FROM || `"Billnaw POS" <${env.SMTP_USER}>`,
    to: email,
    subject: `🔐 Billnaw POS - Your 6-Digit Code is ${otp}`,
    text: `Billnaw POS Verification Code: ${otp}\n\nUse this code to ${actionText}.\nExpires in 10 minutes.\nDo not share this code with anyone.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #FAF7F4; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background: #FFFFFF; border-radius: 14px; border: 1.5px solid #E6DCCD; padding: 24px; text-align: center;">
          <h2 style="color: #143832; margin-top: 0;">Billnaw POS</h2>
          <p style="color: #4B5563; font-size: 14px;">Your 6-digit one-time code to <strong>${actionText}</strong> is:</p>
          <div style="background: #ECFDF5; border: 2px dashed #10B981; border-radius: 10px; padding: 14px; margin: 18px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #047857; font-family: monospace;">${otp}</span>
          </div>
          <p style="color: #6B7280; font-size: 12px;">⏱️ This code is valid for 10 minutes.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return {
      success: true,
      message: `A 6-digit verification code has been dispatched to ${email}.`
    };
  } catch (err) {
    console.error('[CloudFunction:SendOtp] SMTP dispatch error:', err.message);
    return {
      success: false,
      error: 'Failed to deliver email. Please verify SMTP credentials or check server logs.'
    };
  }
}

/**
 * Verifies submitted OTP against cached salted SHA-256 hash.
 * @param {Object} req - { email, otp }
 * @returns {{ success: boolean, error?: string }}
 */
export function handleVerifyOtp(req) {
  const email = normalizeEmail(req.email);
  const enteredOtp = String(req.otp || '').trim();

  const record = otpMemoryCache.get(email);
  if (!record) {
    return { success: false, error: 'No active code found for this email. Please request a new code.' };
  }

  if (Date.now() > record.expiresAt) {
    otpMemoryCache.delete(email);
    return { success: false, error: 'Verification code has expired. Please request a new code.' };
  }

  if (record.attempts >= 3) {
    otpMemoryCache.delete(email);
    return { success: false, error: 'Too many incorrect attempts. Code invalidated.' };
  }

  record.attempts++;
  const computed = crypto.createHash('sha256').update(enteredOtp + record.salt).digest('hex');

  if (computed !== record.hashedOtp) {
    return { success: false, error: `Incorrect verification code. ${3 - record.attempts} attempts remaining.` };
  }

  // Single-use invalidation
  otpMemoryCache.delete(email);
  return { success: true };
}

/**
 * Relays settled invoice data to owner's Google Sheet webhook without exposing URL to client.
 * @param {Object} invoiceData
 * @param {string} webhookUrl
 * @returns {Promise<{ success: boolean }>}
 */
export async function handleSheetsRelay(invoiceData, webhookUrl) {
  if (!webhookUrl) {
    return { success: false, error: 'Google Sheets Webhook URL not configured.' };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_invoice',
        data: invoiceData,
        timestamp: new Date().toISOString()
      })
    });

    return { success: res.ok };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
