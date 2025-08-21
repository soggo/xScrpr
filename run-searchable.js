#!/usr/bin/env node
const {
  searchWebsites
} = require('./searchable.js');
async function main() {
  console.log(' Running Searchable Module Standalone');
  console.log('=====================================');
  try {
    await searchWebsites();
    console.log('\n Searchable module completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n Searchable module failed:', error.message);
    process.exit(1);
  }
}
process.on('SIGINT', () => {
  console.log('\n️  Process interrupted. Exiting gracefully...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n️  Process terminated. Exiting gracefully...');
  process.exit(0);
});
main();