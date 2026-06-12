const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const screenshots = [
  {
    name: 'screenshot-dashboard',
    width: 1280,
    height: 800,
    form_factor: 'wide',
    label: 'Prime ERP Dashboard',
    elements: [
      { type: 'rect', x: 0, y: 0, w: 1280, h: 800, color: '#f1f5f9' },
      { type: 'rect', x: 0, y: 0, w: 240, h: 800, color: '#1e293b' },
      { type: 'rect', x: 260, y: 20, w: 980, h: 40, color: '#ffffff', radius: 8 },
      { type: 'rect', x: 260, y: 80, w: 320, h: 160, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 600, y: 80, w: 320, h: 160, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 940, y: 80, w: 300, h: 160, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 260, y: 260, w: 980, h: 300, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 260, y: 580, w: 470, h: 180, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 750, y: 580, w: 490, h: 180, color: '#ffffff', radius: 12 },
    ]
  },
  {
    name: 'screenshot-mobile',
    width: 390,
    height: 844,
    form_factor: 'narrow',
    label: 'Prime ERP Mobile',
    elements: [
      { type: 'rect', x: 0, y: 0, w: 390, h: 844, color: '#f1f5f9' },
      { type: 'rect', x: 0, y: 0, w: 390, h: 50, color: '#2563eb' },
      { type: 'rect', x: 12, y: 70, w: 366, h: 120, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 12, y: 205, w: 366, h: 120, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 12, y: 340, w: 366, h: 200, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 12, y: 555, w: 366, h: 200, color: '#ffffff', radius: 12 },
      { type: 'rect', x: 0, y: 780, w: 390, h: 64, color: '#ffffff' },
    ]
  },
];

async function generateScreenshots() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  for (const shot of screenshots) {
    const layers = [];
    for (const el of shot.elements) {
      let svg = `<svg width="${el.w}" height="${el.h}">`
        + `<rect x="0" y="0" width="${el.w}" height="${el.h}" rx="${el.radius || 0}" fill="${el.color}" />`;
      // Add a subtle inner border
      if (el.color === '#ffffff') {
        svg += `<rect x="0" y="0" width="${el.w}" height="${el.h}" rx="${el.radius || 0}" fill="none" stroke="#e2e8f0" stroke-width="1" />`;
      }
      svg += `</svg>`;
      layers.push({
        input: Buffer.from(svg),
        top: el.y,
        left: el.x,
      });
    }

    const outPath = path.join(PUBLIC_DIR, `${shot.name}.png`);
    await sharp({
      create: {
        width: shot.width,
        height: shot.height,
        channels: 4,
        background: { r: 241, g: 245, b: 249, alpha: 1 },
      }
    })
      .composite(layers)
      .png()
      .toFile(outPath);
    console.log(`Generated: ${outPath} (${shot.width}x${shot.height})`);
  }

  console.log('All screenshots generated in public/');
}

generateScreenshots().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
