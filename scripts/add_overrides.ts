import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!data.overrides) data.overrides = {};
data.overrides['@hono/node-server'] = '^1.19.13';
data.overrides['@xmldom/xmldom'] = '^0.8.13';
data.overrides['brace-expansion'] = '^1.1.13';
data.overrides['dompurify'] = '^3.3.4';
data.overrides['ip-address'] = '^10.1.1';

fs.writeFileSync('package.json', JSON.stringify(data, null, 2) + '\n');
