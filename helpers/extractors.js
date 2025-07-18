// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js'; // Ensure VARIANT_PRICE_RATE is imported if used here directly, though calculatePrices handles it now.
// helpers/extractors.js

// ... (existing imports and functions) ...

/**
 * Handles the collection and iteration of product variants (colors and sizes).
 * This function will click through variants, extract data, and return a list of Shopify rows.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @param {string} url - The URL of the product being scraped.
 * @param {string} extraTags - Additional tags to apply to the product.
 * @returns {Promise<Array<object>>} An array of Shopify-formatted product rows.
 */
export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];

  try {
    await gotoMacyWithRetries(page, url);
    console.info("✅ Page loaded, waiting for stability...");
    // Increased initial wait time after load state for heavy JS sites
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000); // Increased from 3000ms

    // --- New: Try to hide common intercepting elements before starting variant clicks ---
    try {
      console.log("Attempting to hide potential intercepting elements...");
      await page.addStyleTag({
        content: `
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar, #teleported {
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          /* If a persistent popup or overlay appears, add its selector here */
          .modal-overlay, .modal-dialog {
            display: none !important;
          }
        `
      });
      console.log("Potential intercepting elements hidden.");
    } catch (styleError) {
      console.warn("⚠️ Could not apply style to hide elements:", styleError.message);
    }
    // --- End New ---


    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(",").map(tag => tag.trim()),
        ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
      ]),
    ]
      .filter(Boolean)
      .join(", ");

    let option1Name = "";
    let option2Name = "";

    const optionNameElements = await page.$$('legend.form-label, span.updated-label.label');
    for (const el of optionNameElements) {
        const text = await el.textContent();
        if (text.includes('Color') && !option1Name) {
            option1Name = text.replace(':', '').trim();
        } else if (text.includes('Size') && !option2Name) {
            option2Name = text.replace(':', '').trim();
        }
    }
    if (!option1Name) option1Name = "Color";
    if (!option2Name) option2Name = "Size";


    let colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    let sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    if (colorSwatchLabels.length > 0) {
      console.log(`🔎 Found ${colorSwatchLabels.length} colors.`);
      for (let i = 0; i < colorSwatchLabels.length; i++) {
        // Re-fetch elements inside the loop to ensure they are fresh and clickable
        const currentColorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
        const colorLabel = currentColorSwatchLabels[i];

        if (!colorLabel) {
            console.warn(`Color label at index ${i} not found after re-fetch, skipping.`);
            continue;
        }

        const isColorSelected = await colorLabel.evaluate(el => el.classList.contains('color-swatch-selected') || el.querySelector('input[type="radio"]:checked') !== null);
        const isColorDisabled = await colorLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isColorSelected && !isColorDisabled) {
          console.log(`Clicking color swatch for index ${i}...`);
          // Use force: true as a last resort, but first try to hide intercepting elements
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500);
        } else {
          console.log(`Color swatch for index ${i} already selected or disabled.`);
          if (isColorDisabled) continue;
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(async () => {
                                        const altText = await colorLabel.$eval('img', img => img.alt).catch(() => '');
                                        if (altText) return altText;
                                        return colorLabel.textContent().catch(() => 'Unknown Color');
                                    });
        console.log(`Current color selected: ${currentOption1Value}`);


        const mainImage = await extractMainImage(page);

        sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

        if (sizeChipLabels.length > 0) {
          console.log(`🔎 Found ${sizeChipLabels.length} sizes for color "${currentOption1Value}".`);
          for (let j = 0; j < sizeChipLabels.length; j++) {
            const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            const sizeLabel = currentSizeChipLabels[j];

            if (!sizeLabel) {
                console.warn(`Size label at index ${j} not found after re-fetch, skipping.`);
                continue;
            }

            const isSizeSelected = await sizeLabel.evaluate(el => el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null);
            const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

            if (!isSizeSelected && !isSizeDisabled) {
              console.log(`Clicking size chip for index ${j} for color "${currentOption1Value}"...`);
              // Use Playwright's click options to handle overlaps
              await sizeLabel.click({ timeout: 10000 }); // Retrying click with default timeout increased
              await page.waitForTimeout(1000); // Small delay for price/stock to update
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected or disabled.`);
              if (isSizeDisabled) continue;
            }

            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                        .catch(async () => sizeLabel.textContent().catch(() => 'Unknown Size'));
            console.log(`Current size selected: ${currentOption2Value}`);


            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

            allShopifyRows.push({
              "Handle": handle,
              "Title": allShopifyRows.length === 0 ? title : "",
              "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
              "Vendor": "Macy's",
              "Type": "Footwear",
              "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
              "Published": "TRUE",
              "Option1 Name": option1Name,
              "Option1 Value": currentOption1Value,
              "Option2 Name": option2Name,
              "Option2 Value": currentOption2Value,
              "Option3 Name": "",
              "Option3 Value": "",
              "Variant SKU": extractSKU(page.url()),
              "Variant Grams": "",
              "Variant Price": variantPrice,
              "Variant Compare At Price": compareAtPrice,
              "Variant Cost": costPerItem,
              "Variant Taggable": "",
              "Variant Taxable": "TRUE",
              "Variant Barcode": "",
              "Image Src": mainImage,
              "Image Position": 1,
              "Image Alt Text": `${title} - ${currentOption1Value} ${currentOption2Value}`,
              "Gift Card": "FALSE",
              "SEO Title": "",
              "SEO Description": "",
              "Google Shopping / Google Product Category": "",
              "Google Shopping / Gender": "",
              "Google Shopping / Age Group": "",
              "Google Shopping / MPN": "",
              "Google Shopping / Adult": "FALSE",
              "Google Shopping / Condition": "New",
              "Google Shopping / Custom Product": "FALSE",
              "Google Shopping / Custom Label 0": "",
              "Google Shopping / Custom Label 1": "",
              "Google Shopping / Custom Label 2": "",
              "Google Shopping / Custom Label 3": "",
              "Google Shopping / Custom Label 4": "",
              "Variant Image": mainImage,
              "Variant Weight Unit": "oz",
              "Variant Tax Code": "",
              "Cost per item": costPerItem,
              "Price": variantPrice,
              "Compare At Price": compareAtPrice,
              "original_product_url": url,
            });
          }
        } else { // No size variants, only color
          console.log(`No sizes found for color "${currentOption1Value}", adding as single variant.`);
          const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

          allShopifyRows.push({
            "Handle": handle,
            "Title": allShopifyRows.length === 0 ? title : "",
            "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
            "Vendor": "Macy's",
            "Type": "Footwear",
            "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
            "Published": "TRUE",
            "Option1 Name": option1Name,
            "Option1 Value": currentOption1Value,
            "Option2 Name": "",
            "Option2 Value": "",
            "Option3 Name": "",
            "Option3 Value": "",
            "Variant SKU": extractSKU(page.url()),
            "Variant Grams": "",
            "Variant Price": variantPrice,
            "Variant Compare At Price": compareAtPrice,
            "Variant Cost": costPerItem,
            "Variant Taggable": "",
            "Variant Taxable": "TRUE",
            "Variant Barcode": "",
            "Image Src": mainImage,
            "Image Position": 1,
            "Image Alt Text": `${title} - ${currentOption1Value}`,
            "Gift Card": "FALSE",
            "SEO Title": "",
            "SEO Description": "",
            "Google Shopping / Google Product Category": "",
            "Google Shopping / Gender": "",
            "Google Shopping / Age Group": "",
            "Google Shopping / MPN": "",
            "Google Shopping / Adult": "FALSE",
            "Google Shopping / Condition": "New",
            "Google Shopping / Custom Product": "FALSE",
            "Google Shopping / Custom Label 0": "",
            "Google Shopping / Custom Label 1": "",
            "Google Shopping / Custom Label 2": "",
            "Google Shopping / Custom Label 3": "",
            "Google Shopping / Custom Label 4": "",
            "Variant Image": mainImage,
            "Variant Weight Unit": "oz",
            "Variant Tax Code": "",
            "Cost per item": costPerItem,
            "Price": variantPrice,
            "Compare At Price": compareAtPrice,
            "original_product_url": url,
          });
        }
      }
    } else if (sizeChipLabels.length > 0) { // Product has only sizes (master variant)
      console.log(`🔎 Found ${sizeChipLabels.length} sizes (no colors).`);
      // option1Name should already be "Size" from initial detection, or will fallback.

      for (let i = 0; i < sizeChipLabels.length; i++) {
        const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeChipLabels[i];

        if (!sizeLabel) {
            console.warn(`Size label at index ${i} not found after re-fetch, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabel.evaluate(el => el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null);
        const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isSizeSelected && !isSizeDisabled) {
          console.log(`Clicking size chip for index ${i}...`);
          // Using Playwright's click options to handle overlaps
          await sizeLabel.click({ timeout: 10000 }); // Retrying click with default timeout increased
          await page.waitForTimeout(1000);
        } else {
          console.log(`Size chip for index ${i} already selected or disabled.`);
          if (isSizeDisabled) continue;
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(async () => sizeLabel.textContent().catch(() => 'Unknown Size'));
        console.log(`Current size selected: ${currentOption1Value}`);


        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

        allShopifyRows.push({
          "Handle": handle,
          "Title": allShopifyRows.length === 0 ? title : "",
          "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
          "Vendor": "Macy's",
          "Type": "Footwear",
          "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
          "Published": "TRUE",
          "Option1 Name": option1Name,
          "Option1 Value": currentOption1Value,
          "Option2 Name": "",
          "Option2 Value": "",
          "Option3 Name": "",
          "Option3 Value": "",
          "Variant SKU": extractSKU(page.url()),
          "Variant Grams": "",
          "Variant Price": variantPrice,
          "Variant Compare At Price": compareAtPrice,
          "Variant Cost": costPerItem,
          "Variant Taggable": "",
          "Variant Taxable": "TRUE",
          "Variant Barcode": "",
          "Image Src": mainImage,
          "Image Position": 1,
          "Image Alt Text": `${title} - ${currentOption1Value}`,
          "Gift Card": "FALSE",
          "SEO Title": "",
          "SEO Description": "",
          "Google Shopping / Google Product Category": "",
          "Google Shopping / Gender": "",
          "Google Shopping / Age Group": "",
          "Google Shopping / MPN": "",
          "Google Shopping / Adult": "FALSE",
          "Google Shopping / Condition": "New",
          "Google Shopping / Custom Product": "FALSE",
          "Google Shopping / Custom Label 0": "",
          "Google Shopping / Custom Label 1": "",
          "Google Shopping / Custom Label 2": "",
          "Google Shopping / Custom Label 3": "",
          "Google Shopping / Custom Label 4": "",
          "Variant Image": mainImage,
          "Variant Weight Unit": "oz",
          "Variant Tax Code": "",
          "Cost per item": costPerItem,
            "Price": variantPrice,
            "Compare At Price": compareAtPrice,
          "original_product_url": url,
        });
      }
    } else { // No variants
      console.log("🔎 No variants found for this product.");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

      allShopifyRows.push({
        "Handle": handle,
        "Title": title,
        "Body (HTML)": descriptionHtml,
        "Vendor": "Macy's",
        "Type": "Footwear",
        "Tags": finalProductTags,
        "Published": "TRUE",
        "Option1 Name": "",
        "Option1 Value": "",
        "Option2 Name": "",
        "Option2 Value": "",
        "Option3 Name": "",
        "Option3 Value": "",
        "Variant SKU": extractSKU(page.url()),
        "Variant Grams": "",
        "Variant Price": variantPrice,
        "Variant Compare At Price": compareAtPrice,
        "Variant Cost": costPerItem,
        "Variant Taggable": "",
        "Variant Taxable": "TRUE",
        "Variant Barcode": "",
        "Image Src": mainImage,
        "Image Position": 1,
        "Image Alt Text": title,
        "Gift Card": "FALSE",
        "SEO Title": "",
        "SEO Description": "",
        "Google Shopping / Google Product Category": "",
        "Google Shopping / Gender": "",
        "Google Shopping / Age Group": "",
        "Google Shopping / MPN": "",
        "Google Shopping / Adult": "FALSE",
        "Google Shopping / Condition": "New",
        "Google Shopping / Custom Product": "FALSE",
        "Google Shopping / Custom Label 0": "",
        "Google Shopping / Custom Label 1": "",
        "Google Shopping / Custom Label 2": "",
        "Google Shopping / Custom Label 3": "",
        "Google Shopping / Custom Label 4": "",
        "Variant Image": mainImage,
        "Variant Weight Unit": "oz",
        "Variant Tax Code": "",
        "Cost per item": costPerItem,
        "Price": variantPrice,
        "Compare At Price": compareAtPrice,
        "original_product_url": url,
      });
    }
    return allShopifyRows;
  } catch (error) {
    console.error(`❌ Error in extractMacyProductData for ${url}:`, error.message);
    throw error;
  }
}