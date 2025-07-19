import { VARIANT_PRICE_RATE } from "./constants.js";

/**
 * Formats a given URL into a Shopify-compatible handle.
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
 */
export function extractSKU(url) {
  try {
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
 * Calculates prices based on extracted "Cost per item"
 */
export function calculatePrices(displayedCostPerItemText) {
  let costPerItem = "";
  let variantPrice = "";
  let compareAtPrice = "";

  if (displayedCostPerItemText) {
    const cleanedCost = parseFloat(displayedCostPerItemText.replace(/[^0-9.]/g, ''));
    if (!isNaN(cleanedCost)) {
      costPerItem = cleanedCost.toFixed(2);
      const calculatedVariant = cleanedCost * VARIANT_PRICE_RATE;
      variantPrice = calculatedVariant.toFixed(2);
      compareAtPrice = costPerItem;
    } else {
      console.warn(`⚠️ Could not parse cost per item: "${displayedCostPerItemText}"`);
    }
  }

  return { costPerItem, variantPrice, compareAtPrice };
}
