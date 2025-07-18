// helpers/gotoWithRetries.js (After)
import { SELECTORS } from './constants.js';

export async function gotoMacyWithRetries(page, url, retries = 3) { // Renamed function
  const fallbackSelectors = [
    SELECTORS.PRODUCT.TITLE_BRAND, // Brand name
    SELECTORS.PRODUCT.PRICE_WRAPPER,    // Price wrapper
    SELECTORS.PRODUCT.MAIN_IMAGE // Main Image
  ];

  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`🌐 Loading (attempt ${i+1}/${retries+1}): ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for any of the key elements to appear
      await Promise.any([
        ...fallbackSelectors.map(selector =>
          page.waitForSelector(selector, { timeout: 15000 })
        ),
        page.waitForTimeout(10000) // Fallback timeout for general page stability
      ]);

      return; // Success
    } catch (error) {
      console.warn(`⚠️ Attempt ${i+1} failed for ${url}: ${error.message}`);
      if (i === retries) throw error;
      await page.waitForTimeout(3000 * (i+1)); // Exponential backoff
    }
  }
}