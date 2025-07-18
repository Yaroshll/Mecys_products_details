// helpers/fileIO.js
import fs from "fs";
import path from "path";
import xlsx from "xlsx";

export function saveToCSVAndExcel({
  productRow,
  excel = true,
  csv = true,
  failedUrls,
}) {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .slice(0, 16)
    .replace("T", "_")
    .replace(":", "-");
  const fileName = `Macy_products_${timestamp}`; // Changed filename prefix
  const outputDir = "./output";

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const ws = xlsx.utils.json_to_sheet(productRow);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");

  const csvPath = path.join(outputDir, `${fileName}.csv`);
  const excelPath = path.join(outputDir, `${fileName}.xlsx`);
  const jsonPath = path.join(outputDir, `${fileName}_failed_urls.json`);

  csv && xlsx.writeFile(wb, csvPath, { bookType: "csv" });
  excel && xlsx.writeFile(wb, excelPath);

  if (failedUrls && failedUrls.length) {
    fs.writeFileSync(jsonPath, JSON.stringify(failedUrls, null, 2), "utf-8");
    console.log("✅ Saved failed URL list to JSON file.");
  }
}