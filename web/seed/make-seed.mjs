// Writes seed/demo-data.json from the same synthetic data the demo mode uses.
// Run: node seed/make-seed.mjs
// Then import it in Firebase console > Realtime Database > ⋮ > Import JSON.
import { writeFileSync } from 'node:fs';
import { buildDemoData } from '../src/lib/demoData.js';

const data = buildDemoData(Date.now());
const out = new URL('./demo-data.json', import.meta.url);
writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${out.pathname} (${Object.keys(data.env.history).length} history points, ${Object.keys(data.codes).length} codes)`);
