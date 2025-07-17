// index.js
import { launchBrowser } from "./helpers/browser.js";
import { extractMacysProductData } from "./helpers/extractors.js";
import { saveToCSVAndExcel } from "./helpers/fileIO.js";

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const urls = [
    "https://www.macys.com/shop/product/jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals?ID=19766033"
  ];

  let allShopifyRows = [];

  for (const url of urls) {
    try {
      const shopifyRows = await extractMacysProductData(page, url);
      allShopifyRows.push(...shopifyRows);
      console.log("✅ Processed:", url);
    } catch (err) {
      console.error("❌ Error scraping:", url, err.message);
    }
  }

  saveToCSVAndExcel({
    productRow: allShopifyRows,
    excel: true,
    csv: true,
    failedUrls: [],
  });

  await browser.close();
})();
