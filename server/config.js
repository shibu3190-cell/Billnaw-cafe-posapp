import fs from 'fs';
import path from 'path';

// Automatically load .env file if present in working directory (Node.js 20.6.0+ native)
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch (e) {
  // Silent fallback if .env is missing or invalid
}

export const CONFIG = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  host: process.env.HOST || '0.0.0.0',
  gemini: {
    // Check all standard Gemini API key environment variables dynamically
    get apiKey() {
      const k = (
        process.env.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY2 ||
        process.env.API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENAI_API_KEY ||
        ''
      ).trim();
      return (k && k.length > 15) ? k : '';
    },
    model: 'gemini-3.5-flash',
    imageModel: 'gemini-3.5-flash'
  },
  sheets: {
    // Default fallback webhook url kept strictly server-side
    defaultWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbyZiNTkt5uHGhAy9efNz-6bKYw41YrMbM4CBnuAFTTxJU_ubGpF4VnDuj6zS73NlA3S2w/exec'
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'abhi-pro-cafe-pos',
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda',
    authDomain: 'abhi-pro-cafe-pos.firebaseapp.com',
    storageBucket: 'abhi-pro-cafe-pos.firebasestorage.app',
    messagingSenderId: '323985422709',
    appId: '1:323985422709:web:700b77f1a0ff4dc723bb3c',
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCha9cL9MOmOZjweNd9ZXCX9V5sDh-RlAU'
  },
  email: {
    get host() { return process.env.SMTP_HOST || 'smtp.gmail.com'; },
    get port() { return parseInt(process.env.SMTP_PORT || '587', 10); },
    get secure() { return process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465'; },
    get user() { return process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || ''; },
    get pass() { 
      const raw = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || '';
      return raw ? raw.trim().replace(/\s+/g, '') : '';
    },
    get from() { return process.env.SMTP_FROM || process.env.EMAIL_FROM || (this.user ? `"Billnaw POS" <${this.user}>` : '"Billnaw POS" <no-reply@billnawcafe.com>'); },
    get resendApiKey() { return process.env.RESEND_API_KEY || ''; }
  }
};
