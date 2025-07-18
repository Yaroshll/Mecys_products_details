// helpers/extractors.js (After)
//import { getDescription } from "./description.js";
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
  //generateCompareAtPrice, // Assuming generateCompareAtPrice is also available in formatters.js or a common utility
} from "./formatters.js"; // All formatters in one import
import { gotoMacyWithRetries} from "./gotoWithRetries.js"; // Renamed to gotoMacyWithRetries in browser.js
import { SELECTORS } from './constants.js';

/**
 * Extracts the brand and product name from the title element.
 * @param {import('playwright').Page} page
 * @returns {Promise<{brand: string, productName: string}>}
 */
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  try {
    brand = await page.$eval(SELECTORS.PRODUCT.TITLE_BRAND, (el) =>
      el.textContent.trim()
    );
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }
  try {
    productName = await page.$eval(SELECTORS.PRODUCT.TITLE_NAME, (el) =>
      el.textContent.trim()
    );
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }
  return { brand, productName };
}

/**
 * Extracts the previous price from the price wrapper.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The full price string from aria-label, or empty string.
 */
export async function extractPreviousPrice(page) {
  try {
    // Wait for the price wrapper to be visible
    await page.waitForSelector(SELECTORS.PRODUCT.PRICE_WRAPPER, { timeout: 10000 });
    const priceWrapper = await page.$(SELECTORS.PRODUCT.PRICE_WRAPPER);
    if (priceWrapper) {
      // Find the span inside with the aria-label
      const priceSpan = await priceWrapper.$('span[aria-label]');
      if (priceSpan) {
        return await priceSpan.getAttribute('aria-label') || '';
      }
    }
  } catch (error) {
    console.warn("⚠️ Could not extract price:", error.message);
  }
  return "";
}

/**
 * Extracts the main product image URL.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The image URL.
 */
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { timeout: 5000 });
    return await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, (img) => img.src);
  } catch (error) {
    console.warn("⚠️ Could not extract main image:", error.message);
    return "";
  }
}

/**
 * Extracts breadcrumb links and formats them as a comma-separated string.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} Comma-separated breadcrumbs.
 */
export async function extractBreadcrumbs(page) {
  try {
    // Wait for at least one breadcrumb link to appear
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { timeout: 5000 });
    const breadcrumbs = await page.$$eval(
      SELECTORS.BREADCRUMBS.LINKS,
      (anchors) =>
        anchors
          .map((a) => {
            const svg = a.querySelector('svg');
            if (svg) {
              // Remove the SVG element if present
              const tempDiv = document.createElement('div');
              tempDiv.appendChild(a.cloneNode(true));
              tempDiv.querySelector('svg')?.remove();
              return tempDiv.textContent.trim().replace(/,/g, ';');
            }
            return a.textContent.trim().replace(/,/g, ';');
          })
          .filter(Boolean)
          .join(",")
    );
    return breadcrumbs;
  } catch (error) {
    console.warn("⚠️ Could not extract breadcrumbs:", error.message);
    return "";
  }
}

/**
 * Extracts description and features HTML.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} Combined HTML description.
 */
export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    // Click the description button to reveal content
    const descriptionButton = await page.$(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    if (descriptionButton) {
      await descriptionButton.click();
      await page.waitForTimeout(500); // Small delay for content to load
    }

    // Extract main description paragraph
    const mainDescription = await page.$eval(
      SELECTORS.PRODUCT.DESCRIPTION_CONTENT,
      (el) => el.outerHTML // Get outerHTML to preserve original HTML structure
    ).catch(() => "");
    fullDescriptionHtml += mainDescription;

    // Extract Features section
    const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
    if (featuresSection) {
      const featuresHtml = await featuresSection.evaluate(el => el.outerHTML);
      fullDescriptionHtml += featuresHtml;
    }

    // Extract Shipping & Returns section
    const shippingReturnsSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
    if (shippingReturnsSection) {
      const shippingReturnsHtml = await shippingReturnsSection.evaluate(el => el.outerHTML);
      fullDescriptionHtml += shippingReturnsHtml;
    }

  } catch (error) {
    console.warn("⚠️ Could not extract full description:", error.message);
  }
  return fullDescriptionHtml.trim();
}

/**
 * Waits for a potential image change after clicking a variant.
 * @param {object} options
 * @param {import('playwright').Page} options.page
 * @param {import('playwright').ElementHandle} options.anchorToClick
 */
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  let oldMainImage = await extractMainImage(page);

  if (anchorToClick) {
    await anchorToClick.evaluate((el) => el.scrollIntoView());
  }

  await anchorToClick?.click();
  console.log("Waiting for image change...");
  await page.waitForFunction(
    (prevMainImage, selector) => {
      const currMainImage = document.querySelector(selector)?.src;
      if (currMainImage && currMainImage !== prevMainImage) return true;
      return false;
    },
    oldMainImage,
    SELECTORS.PRODUCT.MAIN_IMAGE,
    { timeout: 10000 }
  ).catch(err => console.warn("Image did not change or timed out:", err.message));
}

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
    await gotoMacyWithRetries(page, url); // Using the retries function
    console.info("✅ Page loaded, waiting for stability...");
    await page.waitForTimeout(3000); // Wait for dynamic content to load

    const handle = formatHandleFromUrl(url);
    const { brand, productName } = await extractTitle(page);
    const title = `${brand} ${productName}`.trim();
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    // Combine breadcrumbs and extraTags for Shopify Tags field
    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(",").map(tag => tag.trim()),
        ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
      ]),
    ]
      .filter(Boolean)
      .join(", ");

    // Get all potential color swatches (clickable elements)
    const colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    // Get all potential size chip labels (clickable elements)
    const sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    let option1Name = "";
    let option2Name = "";
    let option1Value = "";
    let option2Value = "";

    // Determine variant option names
    const colorOptionNameEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
    if (colorOptionNameEl) {
        option1Name = (await colorOptionNameEl.evaluate(el => el.textContent.replace(':', '').trim()));
    }
    const sizeOptionNameEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
    if (sizeOptionNameEl) {
        option2Name = (await sizeOptionNameEl.evaluate(el => el.textContent.replace(':', '').trim()));
    }

    if (colorSwatchLabels.length > 0) { // Product has colors (master variant)
        console.log(`🔎 Found ${colorSwatchLabels.length} colors.`);
        for (let i = 0; i < colorSwatchLabels.length; i++) {
            const colorLabel = colorSwatchLabels[i];
            const currentMainImageUrl = await extractMainImage(page); // Get current image before click

            // Click the color swatch if it's not already selected
            const isColorSelected = await colorLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
            if (!isColorSelected) {
              console.log(`Clicking color swatch ${i + 1}/${colorSwatchLabels.length}...`);
              await waitForImageChangeCheck({ page, anchorToClick: colorLabel }); // Wait for image to change
              await page.waitForTimeout(1000); // Additional delay for stability after image change
            } else {
                console.log(`Color swatch ${i + 1}/${colorSwatchLabels.length} already selected.`);
            }

            // Update color labels after a potential click or initial load to get current state
            const updatedColorLabel = (await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS))[i];
            const colorOptionValue = await updatedColorLabel.evaluate(el => el.querySelector('img')?.alt || el.ariaLabel?.replace('Color: ', '').trim() || '');
            if (!option1Name) { // Capture option name only once
                const optionNameElement = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
                if (optionNameElement) {
                    option1Name = (await optionNameElement.evaluate(el => el.textContent.replace(':', '').trim()));
                }
            }
            option1Value = colorOptionValue;

            // Recapture main image after color change
            const mainImage = await extractMainImage(page);

            // Re-fetch size labels as they might change with color
            const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

            if (currentSizeChipLabels.length > 0) { // Product has sizes (slave variant)
                console.log(`🔎 Found ${currentSizeChipLabels.length} sizes for color "${option1Value}".`);
                for (let j = 0; j < currentSizeChipLabels.length; j++) {
                    const sizeLabel = currentSizeChipLabels[j];

                    // Click the size chip if not selected
                    const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
                    if (!isSizeSelected) {
                        console.log(`Clicking size chip ${j + 1}/${currentSizeChipLabels.length} for color "${option1Value}"...`);
                        await sizeLabel.click();
                        await page.waitForTimeout(500); // Small delay after clicking size
                    } else {
                        console.log(`Size chip ${j + 1}/${currentSizeChipLabels.length} for color "${option1Value}" already selected.`);
                    }

                    const updatedSizeLabel = (await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS))[j];
                    const sizeOptionValue = await updatedSizeLabel.evaluate(el => el.textContent.trim());

                    if (!option2Name) { // Capture option name only once
                        const optionNameElement = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
                        if (optionNameElement) {
                            option2Name = (await optionNameElement.evaluate(el => el.textContent.replace(':', '').trim()));
                        }
                    }
                    option2Value = sizeOptionValue;

                    const previousPriceText = await extractPreviousPrice(page);
                    const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(previousPriceText);

                    allShopifyRows.push({
                        "Handle": handle,
                        "Title": allShopifyRows.length === 0 ? title : "",
                        "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
                        "Vendor": "Macy's",
                        "Type": "Footwear", // Example type, adjust as needed
                        "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
                        "Published": "TRUE",
                        "Option1 Name": option1Name,
                        "Option1 Value": option1Value,
                        "Option2 Name": option2Name,
                        "Option2 Value": option2Value,
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
                        "Image Alt Text": `${title} - ${option1Value} ${option2Value}`,
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
                        "Cost per item": costPerItem, // Duplicate for clarity, can be removed if "Variant Cost" is sufficient
                        "Price": variantPrice, // Duplicate for clarity, can be removed if "Variant Price" is sufficient
                        "Compare At Price": compareAtPrice, // Duplicate for clarity, can be removed if "Variant Compare At Price" is sufficient
                        "original_product_url": url,
                    });
                }
            } else { // No size variants, only color
                const previousPriceText = await extractPreviousPrice(page);
                const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(previousPriceText);

                allShopifyRows.push({
                    "Handle": handle,
                    "Title": allShopifyRows.length === 0 ? title : "",
                    "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
                    "Vendor": "Macy's",
                    "Type": "Footwear",
                    "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
                    "Published": "TRUE",
                    "Option1 Name": option1Name,
                    "Option1 Value": option1Value,
                    "Option2 Name": "", // No Option2
                    "Option2 Value": "", // No Option2
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
                    "Image Alt Text": `${title} - ${option1Value}`,
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
            // Re-fetch all color swatches to ensure they are up-to-date for the next iteration
            // This is crucial because clicking a size might re-render or re-enable elements
            if (i < colorSwatchLabels.length - 1) { // Only if there are more colors to process
                colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
            }
        }
    } else if (sizeChipLabels.length > 0) { // Product has only sizes (master variant)
        console.log(`🔎 Found ${sizeChipLabels.length} sizes (no colors).`);
        if (!option1Name) { // Capture option name only once
            const optionNameElement = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
            if (optionNameElement) {
                option1Name = (await optionNameElement.evaluate(el => el.textContent.replace(':', '').trim()));
            }
        }
        for (let i = 0; i < sizeChipLabels.length; i++) {
            const sizeLabel = sizeChipLabels[i];

            // Click the size chip if not selected
            const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
            if (!isSizeSelected) {
                console.log(`Clicking size chip ${i + 1}/${sizeChipLabels.length}...`);
                await sizeLabel.click();
                await page.waitForTimeout(500); // Small delay after clicking size
            } else {
                console.log(`Size chip ${i + 1}/${sizeChipLabels.length} already selected.`);
            }

            const updatedSizeLabel = (await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS))[i];
            option1Value = await updatedSizeLabel.evaluate(el => el.textContent.trim());

            const mainImage = await extractMainImage(page); // Image won't change for size-only variants
            const previousPriceText = await extractPreviousPrice(page);
            const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(previousPriceText);

            allShopifyRows.push({
                "Handle": handle,
                "Title": allShopifyRows.length === 0 ? title : "",
                "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
                "Vendor": "Macy's",
                "Type": "Footwear",
                "Tags": allShopifyRows.length === 0 ? finalProductTags : "",
                "Published": "TRUE",
                "Option1 Name": option1Name,
                "Option1 Value": option1Value,
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
                "Image Alt Text": `${title} - ${option1Value}`,
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
            // Re-fetch size labels for the next iteration if needed
            if (i < sizeChipLabels.length - 1) {
                sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            }
        }
    } else { // No variants
        console.log("🔎 No variants found for this product.");
        const mainImage = await extractMainImage(page);
        const previousPriceText = await extractPreviousPrice(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(previousPriceText);

        allShopifyRows.push({
            "Handle": handle,
            "Title": title,
            "Body (HTML)": descriptionHtml,
            "Vendor": "Macy's",
            "Type": "Footwear",
            "Tags": finalProductTags,
            "Published": "TRUE",
            "Option1 Name": "", // No variants
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