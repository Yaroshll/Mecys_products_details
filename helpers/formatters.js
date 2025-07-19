// helpers/formatters.js
import { VARIANT_PRICE_RATE } from "./constants.js"; // Import the new rate

// ... (formatHandleFromUrl and extractSKU functions) ...

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
  let compareAtPrice = "";

  if (displayedCostPerItemText) {
    // Clean the extracted text to get a number
    const cleanedCostPerItem = parseFloat(displayedCostPerItemText.replace(/[^0-9.]/g, ''));

    if (!isNaN(cleanedCostPerItem)) {
      costPerItem = cleanedCostPerItem.toFixed(2); // Use this as the base "cost" you wanted to extract

      // Calculate variant price using the VARIANT_PRICE_RATE
      const parsedVariantPrice = cleanedCostPerItem * VARIANT_PRICE_RATE;
      variantPrice = parsedVariantPrice.toFixed(2);

      // The "compareAtPrice" will be the original "cost per item" (strike-through price)
      compareAtPrice = costPerItem;

      // Log for debugging
      console.log(`Original Price/Cost: ${costPerItem}, Calculated Variant Price: ${variantPrice}, Compare At Price: ${compareAtPrice}`);
    } else {
      console.warn(`Could not parse displayedCostPerItemText: "${displayedCostPerItemText}"`);
    }
  }

  return { costPerItem, variantPrice, compareAtPrice };
}