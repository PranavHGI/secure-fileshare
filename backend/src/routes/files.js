const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

const prisma = new PrismaClient();
const EXPIRY_HOURS = { '1h': 1, '24h': 24, '7d': 168 };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  try {
    const { iv, data } = encrypt(req.file.buffer);
    const filePath = path.join(UPLOAD_DIR, `${Date.now()}_${req.file.originalname}.enc`);
    fs.writeFileSync(filePath, data);

    const file = await prisma.file.create({
      data: {
        name: req.file.originalname,
        path: filePath,
        iv,
        size: req.file.size,
        userId: req.user.userId
      }
    });

    res.status(201).json({ fileId: file.id, name: file.name });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const files = await prisma.file.findMany({
    where: { userId: req.user.userId },
    select: {
      id: true,
      name: true,
      size: true,
      createdAt: true,
      _count: { select: { shares: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(
    files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      createdAt: f.createdAt,
      shareCount: f._count.shares
    }))
  );
});

router.post('/share', authMiddleware, async (req, res) => {
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

router.get('/download/:id', authMiddleware, async (req, res) => {
  const file = await prisma.file.findFirst({
    where: { id: req.params.id, userId: req.user.userId }
  });
  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    const encData = fs.readFileSync(file.path);
    const decrypted = decrypt(encData, file.iv);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.send(decrypted);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).json({ error: 'Download failed' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const file = await prisma.file.findFirst({
    where: { id: req.params.id, userId: req.user.userId }
  });
  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    await prisma.share.deleteMany({ where: { fileId: file.id } });
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    await prisma.file.delete({ where: { id: file.id } });
    res.json({ message: 'File deleted' });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
