import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('background/service-worker.js', 'utf8');

// I'll manually split them as it's safer than regex for this scale
// ... Actually, I will read the whole file in Node context and split it.
