const router = require('express').Router();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');

const prisma = new PrismaClient();
const EXPIRY_HOURS = { '1h': 1, '24h': 24, '7d': 168 };

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { fileId, expiresIn = '24h' } = req.body;
    if (!fileId) return res.status(400).json({ error: 'fileId is required' });

    const hours = EXPIRY_HOURS[expiresIn] ?? 24;
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: req.user.userId }
    });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const share = await prisma.share.create({
      data: {
        fileId: file.id,
        userId: req.user.userId,
        expiresAt
      }
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({
      shareId: share.id,
      token: share.token,
      expiresAt: share.expiresAt,
      url: `${baseUrl}/share/${share.token}`
    });
  } catch (e) {
    console.error('Create share error:', e);
    if (e.code === 'P2021') {
      return res.status(503).json({ error: 'Share table missing. Run: npx prisma migrate deploy' });
    }
    res.status(500).json({ error: 'Could not create share link' });
  }
});

router.get('/public/:token/info', async (req, res) => {
  try {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: { select: { name: true, size: true } } }
    });

    if (!share) return res.status(404).json({ error: 'Share link not found' });
    if (share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This share link has expired', expired: true });
    }

    res.json({
      fileName: share.file.name,
      size: share.file.size,
      expiresAt: share.expiresAt
    });
  } catch (e) {
    console.error('Share info error:', e);
    res.status(500).json({ error: 'Could not load share info' });
  }
});

router.get('/public/:token', async (req, res) => {
  try {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    });

    if (!share) return res.status(404).json({ error: 'Share link not found' });
    if (share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    if (!fs.existsSync(share.file.path)) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    const encData = fs.readFileSync(share.file.path);
    const decrypted = decrypt(encData, share.file.iv);

    res.setHeader('Content-Disposition', `attachment; filename="${share.file.name}"`);
    res.send(decrypted);
  } catch (e) {
    console.error('Public share download error:', e);
    res.status(500).json({ error: 'Download failed' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const shares = await prisma.share.findMany({
      where: { userId: req.user.userId },
      include: { file: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.json(
      shares.map((s) => ({
        id: s.id,
        token: s.token,
        fileName: s.file.name,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        expired: s.expiresAt < new Date(),
        url: `${baseUrl}/share/${s.token}`
      }))
    );
  } catch (e) {
    console.error('List shares error:', e);
    res.status(500).json({ error: 'Could not load shares' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const share = await prisma.share.findFirst({
    where: { id: req.params.id, userId: req.user.userId }
  });
  if (!share) return res.status(404).json({ error: 'Share not found' });

  await prisma.share.delete({ where: { id: share.id } });
  res.json({ message: 'Share link revoked' });
});

module.exports = router;
