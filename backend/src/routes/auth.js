const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const prisma = new PrismaClient();

const authSchema = z.object({
  email: z.string().trim().email('Invalid email address').transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

function validationMessage(flattened) {
  if (flattened.fieldErrors?.password?.length) return 'Password must be at least 8 characters';
  if (flattened.fieldErrors?.email?.length) return 'Invalid email address';
  return 'Invalid registration details';
}

function isDatabaseError(err) {
  return (
    err?.code === 'P1001' ||
    err?.errorCode === 'P1001' ||
    err?.name === 'PrismaClientInitializationError' ||
    (typeof err?.message === 'string' && err.message.includes("Can't reach database"))
  );
}

router.post('/register', async (req, res) => {
  const result = authSchema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.issues[0]?.message || validationMessage(result.error.flatten());
    return res.status(400).json({ error: msg });
  }

  try {
    const { email, password } = result.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hashed } });

    res.status(201).json({ message: 'User created', userId: user.id });
  } catch (e) {
    console.error('Register error:', e);
    if (isDatabaseError(e)) {
      return res.status(503).json({ error: 'Database is not connected' });
    }
    res.status(500).json({ error: 'Registration failed. Try again later.' });
  }
});

router.post('/login', async (req, res) => {
  const result = authSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  try {
    const { email, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, role: user.role });
  } catch (e) {
    console.error('Login error:', e);
    if (isDatabaseError(e)) {
      return res.status(503).json({ error: 'Database is not connected' });
    }
    res.status(500).json({ error: 'Login failed. Try again later.' });
  }
});

module.exports = router;