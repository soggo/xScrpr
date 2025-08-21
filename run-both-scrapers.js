#!/usr/bin/env node
const {
  spawn
} = require('child_process');
const fs = require('fs');
const path = require('path');
console.log(' Twitter DM Fetcher - Complete Monitoring System');
console.log('='.repeat(50));
console.log(' This will automatically:');
console.log('   • Monitor your Twitter DMs');
console.log('   • Check for new message requests');
console.log('   • Extract content with AI analysis');
console.log('   • Save data to organized files');
console.log('   • Upload to Airtable (if configured)');
console.log('='.repeat(50));
console.log(' Starting both scrapers in sequence...\n');
const requiredFiles = ['scrape-dms.js', 'scrape-message-requests.js'];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(` Error: ${file} not found!`);
    process.exit(1);
  }
}
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n Starting ${scriptName}...`);
    console.log('='.repeat(50));
    const child = spawn('node', [scriptName, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    child.on('close', code => {
      if (code === 0) {
        console.log(`\n ${scriptName} completed successfully!`);
        resolve();
      } else {
        console.error(`\n ${scriptName} failed with exit code ${code}`);
        reject(new Error(`${scriptName} failed with exit code ${code}`));
      }
    });
    child.on('error', error => {
      console.error(`\n Error running ${scriptName}:`, error.message);
      reject(error);
    });
  });
}
async function runBothScrapers() {
  try {
    console.log(' Step 1/2: Running regular DM scraper...');
    await runScript('scrape-dms.js');
    console.log('\n Waiting 3 seconds before starting message requests scraper...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('\n Step 2/2: Running message requests scraper...');
    await runScript('scrape-message-requests.js');
    console.log('\n' + '='.repeat(60));
    console.log(' Both scrapers completed successfully!');
    console.log(' Check the following directories for results:');
    console.log('    regular-dms/data/ - Regular DM data');
    console.log('    regular-dms/screenshots/ - Regular DM screenshots');
    console.log('    message-requests/data/ - Message request data');
    console.log('    message-requests/screenshots/ - Message request screenshots');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n Script execution failed:', error.message);
    console.log('\n Troubleshooting tips:');
    console.log('   1. Make sure both scraper scripts exist and are working');
    console.log('   2. Check your config.json is properly configured');
    console.log('   3. Ensure your Android device is connected and ADB is working');
    console.log('   4. Run individual scripts to isolate issues:');
    console.log('      - node scrape-dms.js');
    console.log('      - node scrape-message-requests.js');
    process.exit(1);
  }
}
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(' Usage: node run-both-scrapers.js');
  console.log('');
  console.log('This script runs both Twitter scrapers in sequence:');
  console.log('  1. Regular DM scraper (scrape-dms.js)');
  console.log('  2. Message requests scraper (scrape-message-requests.js)');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log('');
  console.log(' Output locations:');
  console.log('  regular-dms/data/          - Regular DM JSON data');
  console.log('  regular-dms/screenshots/   - Regular DM screenshots');
  console.log('  message-requests/data/     - Message request JSON data');
  console.log('  message-requests/screenshots/ - Message request screenshots');
  console.log('');
  console.log(' Tip: You can also run individual scrapers:');
  console.log('  node scrape-dms.js');
  console.log('  node scrape-message-requests.js');
  process.exit(0);
}
runBothScrapers();