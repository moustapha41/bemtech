/**
 * Génère des miniatures dans un sous-dossier thumbs/ à côté de chaque image
 * (2022–2025). Relancer après ajout de photos : npm run thumbs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const years = ['2022', '2023', '2024', '2025'].map((y) => path.join(root, y));

const MAX_EDGE = 900;

async function writeThumb(srcPath, destPath) {
  const ext = path.extname(srcPath).toLowerCase();
  let pipeline = sharp(srcPath).rotate().resize(MAX_EDGE, MAX_EDGE, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const tmp = destPath + '.tmp';
  if (ext === '.png') {
    await pipeline.png({ compressionLevel: 9 }).toFile(tmp);
  } else if (ext === '.webp') {
    await pipeline.webp({ quality: 82 }).toFile(tmp);
  } else {
    await pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(tmp);
  }
  await fs.promises.rename(tmp, destPath);
}

async function processFile(filePath) {
  if (filePath.includes(`${path.sep}thumbs${path.sep}`)) return;

  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const thumbDir = path.join(dir, 'thumbs');
  const outPath = path.join(thumbDir, base);

  await fs.promises.mkdir(thumbDir, { recursive: true });

  let srcStat;
  try {
    srcStat = await fs.promises.stat(filePath);
  } catch {
    return;
  }
  if (!srcStat.isFile()) return;

  try {
    const outStat = await fs.promises.stat(outPath);
    if (outStat.mtime >= srcStat.mtime) return;
  } catch {
    /* pas encore de miniature */
  }

  try {
    await writeThumb(filePath, outPath);
    console.log('OK', path.relative(root, outPath));
  } catch (err) {
    console.warn('Skip', path.relative(root, filePath), err.message);
  }
}

async function walk(dir) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'thumbs' || e.name === 'node_modules') continue;
      await walk(full);
    } else {
      await processFile(full);
    }
  }
}

for (const y of years) {
  if (fs.existsSync(y)) {
    console.log('Dossier', path.basename(y), '…');
    await walk(y);
  }
}
console.log('Terminé.');
