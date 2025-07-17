// helpers/fileIO.js
import fs from "fs";
import path from "path";
import xlsx from "xlsx";
// helpers/fileIO.js
export function saveToCSVAndExcel({ productRows = [], csv = true, excel = true, failedUrls = [] }) {
  const rows = Array.isArray(productRows) ? productRows : [];
  if (!rows.length) {
    console.warn("⚠️ No product rows to save.");
    return;
  }

  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fileName = `Mecys_products_${timestamp}`;
  const outputDir = "./output";

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");

  if (csv) xlsx.writeFile(wb, path.join(outputDir, `${fileName}.csv`), { bookType: "csv" });
  if (excel) xlsx.writeFile(wb, path.join(outputDir, `${fileName}.xlsx`));

  if (failedUrls.length) {
    fs.writeFileSync(
      path.join(outputDir, `${fileName}_failed.json`),
      JSON.stringify(failedUrls, null, 2),
      "utf-8"
    );
  }
}
