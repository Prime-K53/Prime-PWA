const { db } = require('../db.cjs');
const { sendEmail } = require('../services/emailService.cjs');

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const createVerification = ({ email, code, purpose, ttlMinutes = 10 }) => {
  return new Promise((resolve, reject) => {
    const id = `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO email_verifications (id, email, code, purpose, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, email.toLowerCase().trim(), code, purpose, expiresAt],
      function (err) {
        if (err) return reject(err);
        resolve({ id, email: email.toLowerCase().trim(), code, purpose, expiresAt });
      }
    );
  });
};

const findLatestPending = (email, purpose) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM email_verifications
       WHERE email = ? AND purpose = ? AND verified = 0 AND expires_at > datetime('now')
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase().trim(), purpose],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

const markVerified = (id) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE email_verifications SET verified = 1, verified_at = datetime('now') WHERE id = ?`,
      [id],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
};

const sendVerificationEmail = async (email, code, purpose) => {
  const subject = purpose === 'company-creation'
    ? 'Verify your email to complete company setup'
    : 'Verify your email address';

  const text = `Your verification code is: ${code}\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Email Verification</h2>
      <p style="color: #555; font-size: 14px;">Your verification code is:</p>
      <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0;">
        ${code}
      </div>
      <p style="color: #555; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
      <p style="color: #888; font-size: 12px; margin-top: 30px;">If you did not request this verification, please ignore this email.</p>
    </div>
  `;

  return sendEmail({ to: email, subject, text, html });
};

const requestVerification = async ({ email, purpose }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const latest = await findLatestPending(normalizedEmail, purpose);
  if (latest) {
    const createdAt = new Date(latest.created_at).getTime();
    const elapsed = Date.now() - createdAt;
    const cooldownMs = 60 * 1000;
    if (elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
      throw new Error(`Please wait ${waitSec} seconds before requesting another code.`);
    }
  }

  const code = generateCode();
  await createVerification({ email: normalizedEmail, code, purpose });

  try {
    await sendVerificationEmail(normalizedEmail, code, purpose);
  } catch (emailErr) {
    console.error('[EmailVerification] send failed:', emailErr);
  }

  return { success: true, message: 'Verification code sent', email: normalizedEmail };
};

const verifyCode = async ({ email, code, purpose }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const row = await findLatestPending(normalizedEmail, purpose);

  if (!row) {
    throw new Error('No pending verification found. Please request a new code.');
  }

  if (row.attempts >= 5) {
    throw new Error('Too many failed attempts. Please request a new code.');
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Verification code has expired. Please request a new code.');
  }

  if (row.code !== code) {
    await new Promise((resolve, reject) => {
      db.run(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?`, [row.id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    throw new Error('Invalid verification code.');
  }

  await markVerified(row.id);
  return { success: true, message: 'Email verified successfully', email: normalizedEmail };
};

module.exports = {
  requestVerification,
  verifyCode,
  findLatestPending,
  sendVerificationEmail
};
