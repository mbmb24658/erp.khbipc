/**
 * Analyze Risk.xlsx structure
 */
const XLSX = require('xlsx');
const path = require('path');

const file = './upload/Risk.xlsx';
const wb = XLSX.readFile(file);

console.log('=== Risk.xlsx Analysis ===');
console.log('Sheets:', wb.SheetNames);
console.log('');

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  console.log(`\n--- Sheet: "${sheetName}" ---`);
  console.log(`Dimensions: ${sheet['!ref']}`);
  console.log(`Total rows: ${rows.length}`);
  
  if (rows.length > 0) {
    console.log(`\nFirst 10 rows:`);
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      const nonEmpty = row.filter(c => c !== null && c !== '').length;
      console.log(`Row ${i+1} (${nonEmpty} cells):`, JSON.stringify(row.slice(0, 15)));
    }
    
    // If there's a header row, show it
    console.log(`\nHeader row (row 1):`);
    rows[0].forEach((h, idx) => {
      if (h !== null && h !== '') {
        console.log(`  Col ${idx}: ${h}`);
      }
    });
    
    // Show 2nd and 3rd rows if they exist
    if (rows.length > 1) {
      console.log(`\nRow 2:`);
      rows[1].forEach((c, idx) => {
        if (c !== null && c !== '') {
          console.log(`  Col ${idx}: ${c}`);
        }
      });
    }
    if (rows.length > 2) {
      console.log(`\nRow 3:`);
      rows[2].forEach((c, idx) => {
        if (c !== null && c !== '') {
          console.log(`  Col ${idx}: ${c}`);
        }
      });
    }
  }
}
