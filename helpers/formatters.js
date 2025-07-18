// helpers/formatters.js
import { VARIANT_PRICE_RATE } from "./constants.js"; // Import the new rate

/**
 * Formats a given URL into a Shopify-compatible handle.
 * @param {string} url - The URL to format.
 * @returns {string} The Shopify handle.
 */
export function formatHandleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname
      .replace(/^\/|\/$/g, "")
      .replace(/\.html$/, "")
      .replace(/\.jsp$/, "");
    let handle = path.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    handle = handle.replace(/^-+|-+$/g, "");
    return handle;
  } catch (error) {
    console.warn("⚠️ Could not format handle from URL:", error.message);
    return "";
  }
}

/**
 * Extracts a SKU-like identifier from the product URL.
 * @param {string} url - The product URL.
 * @returns {string} A potential SKU.
 */
export function extractSKU(url) {
  try {
    // Macy's URLs often have product IDs that can serve as a simple SKU
    const match = url.match(/ID=(\d+)/i) || url.match(/-(\d+)\.html/i);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    console.warn("⚠️ Could not extract SKU from URL:", error.message);
  }
  return "";
}

/**
 * Calculates variant price and compare at price based on the provided "cost per item" (displayed original price).
 *
 * @param {string} displayedCostPerItemText - The extracted text from the element
 * identified as the 'cost per item' (e.g., "$100.00").
 * @returns {{costPerItem: string, variantPrice: string, compareAtPrice: string}}
 */
export function calculatePrices(displayedCostPerItemText) {
  let costPerItem = ""; // This will be the parsed value of the displayedCostPerItemText
  let variantPrice = "";


  if (displayedCostPerItemText) {
    // Clean the extracted text to get a number
    const cleanedCostPerItem = parseFloat(displayedCostPerItemText.replace(/[^0-9.]/g, ''));

    if (!isNaN(cleanedCostPerItem)) {
     
      // Calculate variant price using the VARIANT_PRICE_RATE
      const parsedVariantPrice = cleanedCostPerItem * VARIANT_PRICE_RATE;
      variantPrice = parsedVariantPrice.toFixed(2);

      

      // Log for debugging
      console.log(`Original Price/Cost: ${costPerItem}, Calculated Variant Price: ${variantPrice}`);
    } else {
      console.warn(`Could not parse displayedCostPerItemText: "${displayedCostPerItemText}"`);
    }
  }

  return { costPerItem, variantPrice };
}