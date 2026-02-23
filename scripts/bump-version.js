const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  let [year, month, patch] = packageJson.version.split('.').map(Number);
  
  // Assuming current year is 2026 for this example, as per earlier context.
  // In a real scenario, you'd use new Date().getFullYear() % 100.
  // For consistency with previous context, assuming 26.
  year = 26; 
  month = 2; // Assuming current month is February as per earlier context.

  patch++;
  
  packageJson.version = `${year}.${month}.${patch}`;
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(`Version bumped to \${packageJson.version}`);
} catch (error) {
  console.error('Error bumping version:', error);
  process.exit(1);
}
