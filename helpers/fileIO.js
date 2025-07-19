import fs from "fs";
import path from "path";
import xlsx from "xlsx";

// Fixed columns we want always to appear in this order
const FIXED_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Variant SKU",
  "Variant Price",
  "Variant Compare At Price",
  "Cost per item",
  "Image Src",
  "Image Alt Text",
  "Variant Image",
  "Variant Fulfillment Service",
  "Variant Inventory Policy",
  "Variant Inventory Tracker",
  "original_product_url",
];

export function saveToCSVAndExcel({
  productRow,
  excel = true,
  csv = true,
  failedUrls,
}) {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fileName = `Macy_products_${timestamp}`;
  const outputDir = "./output";

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  if (!productRow || !productRow.length) {
    console.warn("⚠️ No product data to save.");
    return;
  }

  const normalizedRows = productRow.map((item) => {
    const normalized = {};
    FIXED_COLUMNS.forEach((key) => {
      normalized[key] = key in item ? item[key] : "";
    });
    return normalized;
  });

  const ws = xlsx.utils.json_to_sheet(normalizedRows, { header: FIXED_COLUMNS });
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");

  if (csv) {
    const csvPath = path.join(outputDir, `${fileName}.csv`);
    xlsx.writeFile(wb, csvPath, { bookType: "csv", FS: ",", RS: "\n" });
  }

  if (excel) {
    const excelPath = path.join(outputDir, `${fileName}.xlsx`);
    xlsx.writeFile(wb, excelPath);
  }

  if (failedUrls && failedUrls.length) {
    const jsonPath = path.join(outputDir, `${fileName}_failed_urls.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(failedUrls, null, 2), "utf-8");
    console.log("✅ Saved failed URL list to JSON file.");
  }
}
