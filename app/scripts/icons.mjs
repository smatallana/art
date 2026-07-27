/**
 * Generate PWA icon PNGs from the canonical SVG mark.
 * Run: npm run icons -w app   (outputs are committed for deterministic builds)
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(here, '..', 'static', 'icons');
const svg = await readFile(path.join(iconsDir, 'favicon.svg'));

// Maskable icons must keep content inside the central 80% "safe zone" —
// re-render the mark smaller on a full-bleed background.
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#121014"/>
  <g transform="translate(76.8 76.8) scale(0.7)">
    <path d="M64 256 C 140 148, 372 148, 448 256 C 372 364, 140 364, 64 256 Z"
          fill="none" stroke="#C9A96A" stroke-width="26"/>
    <circle cx="256" cy="256" r="58" fill="none" stroke="#C9A96A" stroke-width="26"/>
    <circle cx="256" cy="256" r="20" fill="#C9A96A"/>
  </g>
</svg>`);

const jobs = [
	{ src: svg, size: 192, out: 'icon-192.png' },
	{ src: svg, size: 512, out: 'icon-512.png' },
	{ src: svg, size: 180, out: 'apple-touch-icon.png' },
	{ src: maskableSvg, size: 512, out: 'maskable-512.png' }
];

for (const { src, size, out } of jobs) {
	await sharp(src, { density: 300 })
		.resize(size, size)
		.png()
		.toFile(path.join(iconsDir, out));
	console.log(`wrote static/icons/${out}`);
}
