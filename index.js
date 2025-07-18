// index.js (After)
import { launchBrowser } from "./helpers/browser.js";
import { extractMacyProductData } from "./helpers/extractors.js"; // Renamed for clarity
import { saveToCSVAndExcel } from "./helpers/fileIO.js";
import "dotenv/config";

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1366, height: 768 },
    colorScheme: "light",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const page = await context.newPage();

  // Array of URLs to scrape
  const urlsToScrape = [
    "https://www.macys.com/shop/product/jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals?ID=19766033&tdp=cm_app~zMCOM-NAVAPP~xcm_zone~zrvi_hpdash_zone~xcm_choiceId~z~xcm_pos~zPos2~xcm_srcCatID~z17570",
    // Add more URLs here if needed:
    // "https://www.macys.com/shop/product/another-product-url",
  ];

  let allShopifyRows = [];
  let failedUrls = [];
  let processedCount = 0;
  const totalUrls = urlsToScrape.length;

  for (const urlEntry of urlsToScrape) {
    let url, extraTags;
    // This allows for future expansion if you want to add specific tags per URL
    if (typeof urlEntry === "string") {
      url = urlEntry;
      extraTags = "";
    } else if (typeof urlEntry === "object" && urlEntry.url) {
      url = urlEntry.url;
      extraTags = urlEntry.tags || "";
    } else {
      console.warn("❌ Invalid urlEntry:", urlEntry);
      failedUrls.push(urlEntry);
      continue;
    }

    processedCount++;
    console.log(`\n--- Processing URL ${processedCount} of ${totalUrls} ---`);
    console.log(`URL: ${url}`);

    try {
      // Renamed the function to be more specific to Macy's
      const shopifyRows = await extractMacyProductData(page, url, extraTags);
      allShopifyRows.push(...shopifyRows);
      console.log(`✅ Successfully processed URL ${processedCount} of ${totalUrls}: ${url}`);
    } catch (err) {
      console.error(`❌ Failed to process URL ${processedCount} of ${totalUrls}: ${url}. Error: ${err.message}`);
      failedUrls.push({ url, tags: extraTags });
    }
  }

  saveToCSVAndExcel({
    productRow: allShopifyRows,
    excel: false, // Set to true if you also want an Excel file
    csv: true,
    failedUrls,
  });
  console.log("\n✅ Scraped data saved to output files.");

  await browser.close();
  console.log("Browser closed.");
})();