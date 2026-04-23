/**
 * Image optimization script for BARCODE Network.
 * Compresses all PNGs in public/ to reasonable sizes.
 *
 * Run: node scripts/optimize-images.mjs
 */
import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";

const PUBLIC = "public";

// Target sizes by folder/purpose
const TARGETS = {
  "database": { width: 800, quality: 80 },       // Dossier portraits (display ~320px, 2x for retina)
  "releases": { width: 1200, quality: 85 },       // Album covers
  "root-og": { width: 1200, quality: 80 },        // OG images
  "root-radio": { width: 1400, quality: 80 },     // Radio cover (square)
  "logos": { width: 512, quality: 90 },            // Logos
};

async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getFiles(fullPath));
    } else if (/\.(png|jpg|jpeg)$/i.test(entry.name) && !entry.name.startsWith(".")) {
      files.push(fullPath);
    }
  }
  return files;
}

function getTarget(filePath) {
  if (filePath.includes("database")) return TARGETS["database"];
  if (filePath.includes("releases")) return TARGETS["releases"];
  if (filePath.includes("logos")) return TARGETS["logos"];
  if (filePath.includes("radio-cover")) return TARGETS["root-radio"];
  if (filePath.includes("og-image")) return TARGETS["root-og"];
  return TARGETS["database"]; // default
}

async function optimizeFile(filePath) {
  const before = (await stat(filePath)).size;
  const target = getTarget(filePath);
  
  const image = sharp(filePath);
  const meta = await image.metadata();
  
  // Only resize if wider than target
  const needsResize = meta.width > target.width;
  
  let pipeline = sharp(filePath);
  
  if (needsResize) {
    pipeline = pipeline.resize(target.width, null, { 
      withoutEnlargement: true,
      fit: "inside" 
    });
  }
  
  // Output as optimized PNG
  const buffer = await pipeline
    .png({ quality: target.quality, compressionLevel: 9, effort: 10 })
    .toBuffer();
  
  // Only write if actually smaller
  if (buffer.length < before) {
    await sharp(buffer).toFile(filePath);
    const after = buffer.length;
    const savings = ((1 - after / before) * 100).toFixed(1);
    const beforeMB = (before / 1024 / 1024).toFixed(2);
    const afterMB = (after / 1024 / 1024).toFixed(2);
    console.log(`✓ ${filePath}: ${beforeMB}MB → ${afterMB}MB (${savings}% smaller)${needsResize ? ` [resized to ${target.width}px]` : ""}`);
    return before - after;
  } else {
    console.log(`  ${filePath}: already optimal (${(before/1024/1024).toFixed(2)}MB)`);
    return 0;
  }
}

async function main() {
  console.log("BARCODE Network — Image Optimizer\n");
  
  const files = await getFiles(PUBLIC);
  console.log(`Found ${files.length} images to process\n`);
  
  let totalSaved = 0;
  for (const file of files) {
    totalSaved += await optimizeFile(file);
  }
  
  console.log(`\nTotal saved: ${(totalSaved / 1024 / 1024).toFixed(2)}MB`);
}

main().catch(console.error);