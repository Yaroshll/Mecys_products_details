// helpers/extractors.js
import { 
  calculatePrices, 
  extractSKU, 
  formatHandleFromUrl, 
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from './constants.js';

/**
 * Safely clicks an element with fallback to JavaScript click
 * @param {ElementHandle} element - Playwright element handle
 * @param {number} timeout - Maximum time to wait for click (ms)
 */
async function safeClick(element, timeout = 15000) {
  try {
    // First try standard Playwright click
    await element.scrollIntoViewIfNeeded();
    await element.click({ timeout });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait after click
  } catch (error) {
    // Fallback to JavaScript click if Playwright click fails
    console.warn('Standard click failed, trying JS click...');
    await element.evaluate(el => {
      el.scrollIntoView({block: 'center'});
      el.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

/**
 * Extracts complete product data including all variants from Macy's product page
 * @param {Page} page - Playwright page object
 * @param {string} url - Product URL
 * @param {string} extraTags - Additional tags for product
 * @returns {Promise<Array>} Array of Shopify product rows
 */
export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  let retryCount = 0;
  const maxRetries = 3;

  // Retry loop for page loading reliability
  while (retryCount < maxRetries) {
    try {
      // Navigate to product page with retry logic
      await gotoMacyWithRetries(page, url);
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      
      // Wait for critical product elements to load
      try {
        await page.waitForSelector(SELECTORS.PRODUCT.TITLE_NAME, { timeout: 15000 });
      } catch {
        console.warn('Page did not load properly, retrying...');
        retryCount++;
        continue;
      }

      // Extract basic product info
      const handle = formatHandleFromUrl(url);
      const { brand, productName, title } = await extractTitle(page);
      const descriptionHtml = await extractFullDescription(page);
      const breadcrumbs = await extractBreadcrumbs(page);

      // Combine and deduplicate tags
      const finalProductTags = [
        ...new Set([
          ...breadcrumbs.split(",").map(tag => tag.trim()),
          ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
        ]),
      ].filter(Boolean).join(", ");

      // Determine variant option names (Color, Size etc.)
      let option1Name = "Color";
      let option2Name = "Size";

      try {
        const colorOptionNameEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
        if (colorOptionNameEl) {
          option1Name = (await colorOptionNameEl.textContent()).replace(':', '').trim();
        }
      } catch (error) {
        console.warn("⚠️ Could not get color option name");
      }

      try {
        const sizeOptionNameEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
        if (sizeOptionNameEl) {
          option2Name = (await sizeOptionNameEl.textContent()).replace(':', '').trim();
        }
      } catch (error) {
        console.warn("⚠️ Could not get size option name");
      }

      // Find all available color and size variants
      const colorSwatches = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
      const sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

      // Process products with color variants
      if (colorSwatches.length > 0) {
        console.log(`🟢 Found ${colorSwatches.length} color variants`);

        // Iterate through each color option
        for (let colorIdx = 0; colorIdx < colorSwatches.length; colorIdx++) {
          try {
            // Re-fetch elements to avoid staleness
            const currentColorSwatches = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
            const colorSwatch = currentColorSwatches[colorIdx];
            
            if (!colorSwatch) {
              console.warn(`❌ Color at index ${colorIdx} not found`);
              continue;
            }

            // Get color value before clicking to avoid loading issues
            const colorValue = await colorSwatch.evaluate(el => 
              el.getAttribute('aria-label')?.replace('Color: ', '') || 
              el.querySelector('img')?.alt || 
              el.textContent.trim()
            );

            console.log(`🎨 Processing color: ${colorValue} (${colorIdx + 1}/${colorSwatches.length})`);

            // Check if color is already selected
            const isSelected = await colorSwatch.evaluate(el => 
              el.classList.contains('selected') || 
              el.querySelector('input[type="radio"]:checked') !== null
            );

            if (!isSelected) {
              console.log(`👉 Selecting color: ${colorValue}`);
              await safeClick(colorSwatch);
              await page.waitForTimeout(2000); // Wait for page update
            }

            // Get image after color change
            const mainImage = await extractMainImage(page);
            
            // Process sizes for this color
            const currentSizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            
            if (currentSizeChips.length > 0) {
              console.log(`🔵 Found ${currentSizeChips.length} sizes for color ${colorValue}`);

              // Iterate through each size option
              for (let sizeIdx = 0; sizeIdx < currentSizeChips.length; sizeIdx++) {
                try {
                  const sizeChip = currentSizeChips[sizeIdx];
                  if (!sizeChip) continue;

                  // Get size value before clicking
                  const sizeValue = await sizeChip.evaluate(el => 
                    el.textContent.trim() || 
                    el.getAttribute('aria-label')?.replace('Size: ', '')
                  );

                  // Check if size is already selected
                  const isSizeSelected = await sizeChip.evaluate(el => 
                    el.classList.contains('selected') || 
                    el.querySelector('input[type="radio"]:checked') !== null
                  );

                  if (!isSizeSelected) {
                    console.log(`📏 Selecting size: ${sizeValue}`);
                    await safeClick(sizeChip);
                    await page.waitForTimeout(1500);
                  }

                  // Get pricing after selecting size
                  const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
                  const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

                  // Add variant to results
                  allShopifyRows.push(createShopifyRow({
                    handle,
                    title: allShopifyRows.length === 0 ? title : "",
                    descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
                    tags: allShopifyRows.length === 0 ? finalProductTags : "",
                    option1Name,
                    option1Value: colorValue,
                    option2Name,
                    option2Value: sizeValue,
                    variantPrice,
                    costPerItem,
                    mainImage,
                    imageAltText: `${title} - ${colorValue} ${sizeValue}`,
                    url
                  }));

                } catch (sizeError) {
                  console.error(`❌ Error processing size ${sizeIdx}:`, sizeError);
                }
              }
            } else {
              // Product has colors but no sizes
              const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
              const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

              allShopifyRows.push(createShopifyRow({
                handle,
                title: allShopifyRows.length === 0 ? title : "",
                descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
                tags: allShopifyRows.length === 0 ? finalProductTags : "",
                option1Name,
                option1Value: colorValue,
                variantPrice,
                costPerItem,
                mainImage,
                imageAltText: `${title} - ${colorValue}`,
                url
              }));
            }

          } catch (colorError) {
            console.error(`❌ Error processing color ${colorIdx}:`, colorError);
          }
        }
      } 
      // Process products with only size variants
      else if (sizeChips.length > 0) {
        console.log(`🔵 Found ${sizeChips.length} size variants`);
        option1Name = "Size";

        for (let sizeIdx = 0; sizeIdx < sizeChips.length; sizeIdx++) {
          try {
            const sizeChip = sizeChips[sizeIdx];
            if (!sizeChip) continue;

            const sizeValue = await sizeChip.evaluate(el => 
              el.textContent.trim() || 
              el.getAttribute('aria-label')?.replace('Size: ', '')
            );

            // Check if size is already selected
            const isSelected = await sizeChip.evaluate(el => 
              el.classList.contains('selected') || 
              el.querySelector('input[type="radio"]:checked') !== null
            );

            if (!isSelected) {
              console.log(`📏 Selecting size: ${sizeValue}`);
              await safeClick(sizeChip);
              await page.waitForTimeout(1500);
            }

            const mainImage = await extractMainImage(page);
            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

            allShopifyRows.push(createShopifyRow({
              handle,
              title: allShopifyRows.length === 0 ? title : "",
              descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
              tags: allShopifyRows.length === 0 ? finalProductTags : "",
              option1Name,
              option1Value: sizeValue,
              variantPrice,
              costPerItem,
              mainImage,
              imageAltText: `${title} - ${sizeValue}`,
              url
            }));

          } catch (sizeError) {
            console.error(`❌ Error processing size ${sizeIdx}:`, sizeError);
          }
        }
      } 
      // Process products with no variants
      else {
        console.log("ℹ️ No variants found for this product");
        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

        allShopifyRows.push(createShopifyRow({
          handle,
          title,
          descriptionHtml,
          tags: finalProductTags,
          variantPrice,
          costPerItem,
          mainImage,
          imageAltText: title,
          url
        }));
      }

      return allShopifyRows;

    } catch (mainError) {
      console.error(`❌ Error processing product page (attempt ${retryCount + 1}/${maxRetries}):`, mainError);
      retryCount++;
      if (retryCount >= maxRetries) {
        throw new Error(`Failed to process product after ${maxRetries} attempts`);
      }
    }
  }
}

/**
 * Creates a standardized Shopify product row object
 * @param {Object} params - Product data parameters
 * @returns {Object} Formatted Shopify product row
 */
function createShopifyRow({
  handle,
  title,
  descriptionHtml,
  tags,
  option1Name = "",
  option1Value = "",
  option2Name = "",
  option2Value = "",
  variantPrice,
  costPerItem,
  mainImage,
  imageAltText,
  url
}) {
  return {
    "Handle": handle,
    "Title": title,
    "Body (HTML)": descriptionHtml,
    "Vendor": "Macy's",
    "Type": "Footwear",
    "Tags": tags,
    "Published": "TRUE",
    "Option1 Name": option1Name,
    "Option1 Value": option1Value,
    "Option2 Name": option2Name,
    "Option2 Value": option2Value,
    "Option3 Name": "",
    "Option3 Value": "",
    "Variant SKU": extractSKU(url),
    "Variant Grams": "",
    "Variant Price": variantPrice,
    "Cost per item": costPerItem,
    "Variant Taxable": "TRUE",
    "Variant Barcode": "",
    "Image Src": mainImage,
    "Image Position": 1,
    "Image Alt Text": imageAltText,
    "Gift Card": "FALSE",
    "Google Shopping / Condition": "New",
    "Variant Image": mainImage,
    "Variant Weight Unit": "oz",
    "Price": variantPrice,
    "original_product_url": url,
    // Include additional Shopify fields as needed
  };
}