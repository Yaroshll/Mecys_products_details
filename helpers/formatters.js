// helpers/formatters.js (After)
import { VARIANT_PRICE_RATE } from "./constants.js"; // Only need VARIANT_PRICE_RATE here

// This function should be defined in extractors.js or a dedicated price utility if not already
// Since it's used here and not defined, let's assume it's moved to extractors.js for now,
// or we'll define a simple placeholder if it's not critical for now.
export function generateCompareAtPrice({ variantPrice }) {
  const min = 0.15;
  const max = 0.3;
  const randomPercent = min + Math.random() * (max - min);
  const compareAtPrice = Math.round(variantPrice * (1 + randomPercent));
  return compareAtPrice;
}


export function formatHandleFromUrl(url) {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const pathParts = urlObj.pathname.split("/");
    // Extract base handle before any potential ID or SKU
    const baseHandle = pathParts[pathParts.indexOf("product") + 1]?.split("?")[0].replace(/-+$/, "");
    const sku = extractSKU(urlObj);

    if (!baseHandle || !sku) {
        console.warn(`⚠️ Could not format handle for URL: ${url}. Base handle: ${baseHandle}, SKU: ${sku}`);
        return null;
    }

    return `${baseHandle.replace(/[^\w-]/g, "")}_${sku}`.toLowerCase();
  } catch (error) {
    console.error("❌ Invalid URL for handle extraction:", error.message);
    return null;
  }
}

export function extractSKU(url) {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    // Macy's product ID is usually in the 'ID' search param or part of the pathname
    return urlObj.searchParams.get("ID") || urlObj.pathname.match(/ID=(\d+)/)?.[1] || null;
  } catch (error) {
    console.error("❌ Invalid URL for SKU extraction:", error.message);
    return null;
  }
}

export function calculatePrices(previousPriceText) {
  let costPerItem = 0;
  // Regex to find "AED X.XX" or similar and capture the number
  const match = previousPriceText.match(/AED\s*([\d.,]+)/);
  if (match && match[1]) {
    // Remove commas, convert to float
    costPerItem = parseFloat(match[1].replace(/,/g, ''));
  }

  // Calculate variant price based on the new requirement (1.3 * Cost per item)
  const variantPrice = costPerItem * VARIANT_PRICE_RATE;

  return {
    costPerItem: costPerItem.toFixed(2), // Format to 2 decimal places
    variantPrice: (Math.floor(variantPrice * 100) / 100).toFixed(2), // Round down to two decimal places
    compareAtPrice: generateCompareAtPrice({ variantPrice }),
  };
}