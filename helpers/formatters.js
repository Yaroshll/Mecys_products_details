import { VARIANT_PRICE_RATE } from "./constants.js";

export function formatHandleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname.replace(/^\/|\/$/g, "").replace(/\.html$/, "").replace(/\.jsp$/, "");
    let handle = path.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    return handle.replace(/^-+|-+$/g, "");
  } catch {
    return "";
  }
}

export function extractSKU(url) {
  try {
    const match = url.match(/ID=(\d+)/i) || url.match(/-(\d+)\.html/i);
    if (match && match[1]) return match[1];
  } catch {}
  return "";
}

export function calculatePrices(displayedCostPerItemText) {
  let costPerItem = "";
  let variantPrice = "";
  let compareAtPrice = "";

  if (displayedCostPerItemText) {
    const cleanedCost = parseFloat(displayedCostPerItemText.replace(/[^0-9.]/g, ''));
    if (!isNaN(cleanedCost)) {
      costPerItem = cleanedCost.toFixed(2);
      variantPrice = (cleanedCost * VARIANT_PRICE_RATE).toFixed(2);
      compareAtPrice = costPerItem;
    }
  }

  return { costPerItem, variantPrice, compareAtPrice };
}
