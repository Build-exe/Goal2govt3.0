// Sends the password-reset email via SMTP (nodemailer).
//
// Configure these in backend/.env:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
//
// Easiest free option: a Gmail account with an "App Password"
// (Google Account → Security → 2-Step Verification → App passwords).
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_SECURE=false
//   SMTP_USER=youraddress@gmail.com
//   SMTP_PASS=the 16-character app password (not your normal password)
//   MAIL_FROM=Goal2Govt <youraddress@gmail.com>
//
// If SMTP isn't configured yet, reset links are printed to the server
// console instead of emailed, so local testing still works without setup.

const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

async function sendPasswordResetEmail(toEmail, toName, resetUrl) {
  if (!isConfigured()) {
    console.log('\n[mailer] SMTP is not configured — printing the reset link instead of emailing it:');
    console.log(`[mailer]   To: ${toEmail}`);
    console.log(`[mailer]   Reset link: ${resetUrl}\n`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0d3b7a;">Reset your Goal2Govt password</h2>
      <p>Hi ${toName || 'there'},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one — this link expires in 1 hour.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="background:#0d3b7a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">Reset Password</a>
      </p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <p style="color:#888;font-size:12px;">If the button doesn't work, copy and paste this link into your browser:<br>${resetUrl}</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'Reset your Goal2Govt password',
    html
  });
  return { sent: true };
}

module.exports = { sendPasswordResetEmail, isConfigured };
