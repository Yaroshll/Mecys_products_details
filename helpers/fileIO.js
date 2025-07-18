import fs from 'fs';
import path from 'path';
import { CSV_HEADERS } from './constants.js';

export function saveToCSV(data, filename = 'products.csv') {
  const outputDir = './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const filePath = path.join(outputDir, filename);

  const rows = data.map(item =>
    CSV_HEADERS.map(header => {
      const value = item[header] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csvContent = [CSV_HEADERS.join(','), ...rows].join('\n');
  fs.writeFileSync(filePath, csvContent, 'utf-8');
  console.log(`✅ CSV file saved: ${filePath}`);
}
