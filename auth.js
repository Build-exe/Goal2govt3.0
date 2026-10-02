const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { readUsers, writeUsers } = require('../lib/db');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRY = '7d';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// POST /api/signup  { name, email, password }
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const users = readUsers();
    const emailLower = email.trim().toLowerCase();
    if (users.some(u => u.email.toLowerCase() === emailLower)) {
      return res.status(409).json({ error: 'An account with this email already exists — try logging in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim(),
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/login  { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'No account found with this email. Try signing up.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/me — returns the signed-in user for the given Bearer token
router.get('/me', requireAuth, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  res.json({ user: publicUser(user) });
});

// POST /api/forgot-password  { email }
// Always responds the same way whether or not the email exists, so this
// endpoint can't be used to check which emails are registered.
router.post('/forgot-password', async (req, res) => {
  const genericReply = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
  try {
    const { email } = req.body || {};
    if (!email || !isValidEmail(email)) {
      // Still generic — don't reveal validation details for this one.
      return res.json(genericReply);
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return res.json(genericReply);

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    writeUsers(users);

    const resetUrl = `${SITE_URL}/reset-password.html?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    res.json(genericReply);
  } catch (err) {
    console.error('Forgot-password error:', err);
    // Still generic, so failures don't leak anything either.
    res.json(genericReply);
  }
});

// POST /api/reset-password  { token, password }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing reset token.' });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const tokenHash = hashToken(token);
    const users = readUsers();
    const user = users.find(u => u.resetTokenHash === tokenHash);

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < Date.now()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    delete user.resetTokenHash;
    delete user.resetTokenExpiresAt;
    writeUsers(users);

    res.json({ ok: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/logout — JWTs are stateless, so there's nothing to invalidate
// server-side; this route exists so the frontend has a consistent call to
// make. (A production system might keep a short-lived token blacklist.)
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
