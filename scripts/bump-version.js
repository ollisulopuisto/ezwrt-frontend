import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, '../package.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const [prevYear, prevMonth, prevPatch] = packageJson.version.split('.').map(Number);

  const now = new Date();
  const year = now.getFullYear() % 100;
  const month = now.getMonth() + 1;

  // YY.MM.PATCH: the patch counts releases within the current month.
  const patch = year === prevYear && month === prevMonth ? prevPatch + 1 : 0;

  packageJson.version = `${year}.${month}.${patch}`;

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Version bumped to ${packageJson.version}`);
} catch (error) {
  console.error('Error bumping version:', error);
  process.exit(1);
}
