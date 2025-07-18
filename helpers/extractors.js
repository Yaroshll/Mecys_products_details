// helpers/extractors.js
// Removed import for description.js as its content is now in extractFullDescription
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from './constants.js';

/**
 * Extracts the brand and product name from the title element and formats them.
 * @param {import('playwright').Page} page
 * @returns {Promise<{brand: string, productName: string, title: string}>}
 */
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";

  try {
    brand = await page.$eval(SELECTORS.PRODUCT.TITLE_BRAND, (el) =>
      el.textContent.trim()
    ).catch(() => ""); // Use catch to avoid breaking if selector fails
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = await page.$eval(SELECTORS.PRODUCT.TITLE_NAME, (el) =>
      el.textContent.trim()
    ).catch(() => ""); // Use catch to avoid breaking if selector fails
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }

  // Format the title with a comma if both exist
  if (brand && productName) {
    title = `${brand}, ${productName}`;
  } else if (brand) {
    title = brand;
  } else if (productName) {
    title = productName;
  }

  return { brand, productName, title };
}

/**
 * Extracts the previous price from the price wrapper.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The full price string from aria-label, or empty string.
 */
export async function extractPreviousPrice(page) {
  try {
    // Wait for the price wrapper to be visible
    await page.waitForSelector(SELECTORS.PRODUCT.PRICE_WRAPPER, { state: 'visible', timeout: 10000 });
    const priceWrapper = await page.$(SELECTORS.PRODUCT.PRICE_WRAPPER);
    if (priceWrapper) {
      // Prioritize span with aria-label which often contains the full price string including original/sale
      const priceSpan = await priceWrapper.$('span[aria-label]');
      if (priceSpan) {
        const ariaLabel = await priceSpan.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();
      }

      // Fallback: Check for individual price elements within the wrapper if aria-label isn't enough
      const salePrice = await priceWrapper.$eval(SELECTORS.PRODUCT.SALE_PRICE, el => el.textContent.trim()).catch(() => '');
      const originalPrice = await priceWrapper.$eval(SELECTORS.PRODUCT.ORIGINAL_PRICE, el => el.textContent.trim()).catch(() => '');

      if (salePrice && originalPrice) {
          return `${originalPrice} Sale ${salePrice}`;
      } else if (salePrice) {
          return salePrice;
      } else if (originalPrice) {
          return originalPrice;
      }

      // If all else fails, try to get the general text content of the price wrapper
      return await priceWrapper.textContent().then(text => text.trim()).catch(() => '');
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
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { state: 'visible', timeout: 5000 });
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
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { state: 'visible', timeout: 5000 });
    const breadcrumbs = await page.$$eval(
      SELECTORS.BREADCRUMBS.LINKS,
      (anchors) =>
        anchors
          .map((a) => {
            const svg = a.querySelector('svg');
            if (svg) {
              // Remove the SVG element if present for cleaner text
              const tempDiv = document.createElement('div');
              tempDiv.appendChild(a.cloneNode(true));
              tempDiv.querySelector('svg')?.remove();
              return tempDiv.textContent.trim().replace(/,/g, ';');
            }
            return a.textContent.trim().replace(/,/g, ';');
          })
          .filter(Boolean) // Remove any empty strings
          .join(",")
    );
    return breadcrumbs;
  } catch (error) {
    console.warn("⚠️ Could not extract breadcrumbs:", error.message);
    return "";
  }
}

/**
 * Extracts description and features HTML, ensuring all sections are captured.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} Combined HTML description.
 */
export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    // --- Step 1: Click the description/details button if it exists ---
    const descriptionButton = await page.$(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    if (descriptionButton) {
      console.log("Clicking description/details button...");
      await descriptionButton.click();
      await page.waitForTimeout(1000); // Give time for content to expand/load
    }

    // --- Step 2: Extract the main product description content ---
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, { state: 'visible', timeout: 5000 });
      const mainDescriptionEl = await page.$(SELECTORS.PRODUCT.DESCRIPTION_CONTENT);
      if (mainDescriptionEl) {
        fullDescriptionHtml += await mainDescriptionEl.evaluate(el => el.outerHTML);
        console.log("Extracted main description.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract main description content:", error.message);
    }

    // --- Step 3: Extract Features section ---
    try {
      const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
      if (featuresSection) {
        const featuresHtml = await featuresSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += featuresHtml;
        console.log("Extracted features section.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract features section:", error.message);
    }

    // --- Step 4: Extract Shipping & Returns section ---
    try {
      const shippingReturnsSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
      if (shippingReturnsSection) {
        const shippingReturnsHtml = await shippingReturnsSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += shippingReturnsHtml;
        console.log("Extracted shipping & returns section.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract shipping & returns section:", error.message);
    }

    // You might want to add more specific selectors for other expandable sections
    // or iterate through common section headers if they follow a pattern.

  } catch (error) {
    console.error("❌ Error in extractFullDescription:", error.message);
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
  const oldMainImage = await extractMainImage(page);

  if (anchorToClick) {
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }

  await anchorToClick?.click();
  console.log("Waiting for image change or variant update...");
  // Wait for either the image to change or a short timeout if no image change is expected
  // or if the change is subtle (e.g., only price/stock updates)
  try {
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currMainImage = document.querySelector(selector)?.src;
        if (currMainImage && currMainImage !== prevMainImage) return true;
        return false;
      },
      oldMainImage,
      SELECTORS.PRODUCT.MAIN_IMAGE,
      { timeout: 10000 }
    );
    console.log("✅ Image changed.");
  } catch (err) {
    console.warn("⚠️ Image did not change or timed out after variant click:", err.message);
    // If image doesn't change, still proceed, as other attributes like price/stock might have
  }
  await page.waitForTimeout(1000); // Add a small buffer for page stability after interaction
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
    await gotoMacyWithRetries(page, url);
    console.info("✅ Page loaded, waiting for stability...");
    await page.waitForLoadState('domcontentloaded'); // Ensure basic DOM is ready
    await page.waitForTimeout(3000); // Additional wait for dynamic content

    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page); // Get formatted title
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

    // Determine variant option names
    let option1Name = "";
    let option2Name = "";

    const colorOptionNameEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
    if (colorOptionNameEl) {
      option1Name = (await colorOptionNameEl.textContent()).replace(':', '').trim();
    }
    const sizeOptionNameEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
    if (sizeOptionNameEl) {
      option2Name = (await sizeOptionNameEl.textContent()).replace(':', '').trim();
    }

    let colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    let sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    if (colorSwatchLabels.length > 0) {
      console.log(`🔎 Found ${colorSwatchLabels.length} colors.`);
      for (let i = 0; i < colorSwatchLabels.length; i++) {
        // Re-fetch elements inside the loop to ensure they are fresh and clickable
        const currentColorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
        const colorLabel = currentColorSwatchLabels[i];

        if (!colorLabel) {
            console.warn(`Color label at index ${i} not found, skipping.`);
            continue;
        }

        const isColorSelected = await colorLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
        if (!isColorSelected) {
          console.log(`Clicking color swatch for index ${i}...`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500); // Give time for price/stock to update
        } else {
          console.log(`Color swatch for index ${i} already selected.`);
        }

        const colorOptionValue = await colorLabel.evaluate(el => el.querySelector('img')?.alt || el.ariaLabel?.replace('Color: ', '').trim() || el.textContent.trim());
        if (!option1Name) option1Name = "Color"; // Fallback if name not found
        const currentOption1Value = colorOptionValue;

        const mainImage = await extractMainImage(page);

        // Re-fetch size labels *after* color change as they often depend on color selection
        sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

        if (sizeChipLabels.length > 0) {
          console.log(`🔎 Found ${sizeChipLabels.length} sizes for color "${currentOption1Value}".`);
          for (let j = 0; j < sizeChipLabels.length; j++) {
            const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            const sizeLabel = currentSizeChipLabels[j];

            if (!sizeLabel) {
                console.warn(`Size label at index ${j} not found, skipping.`);
                continue;
            }

            const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
            if (!isSizeSelected) {
              console.log(`Clicking size chip for index ${j} for color "${currentOption1Value}"...`);
              await sizeLabel.click();
              await page.waitForTimeout(1000); // Small delay for price/stock to update
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected.`);
            }

            const sizeOptionValue = await sizeLabel.evaluate(el => el.textContent.trim());
            if (!option2Name) option2Name = "Size"; // Fallback if name not found
            const currentOption2Value = sizeOptionValue;

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
              "Option1 Value": currentOption1Value,
              "Option2 Name": option2Name,
              "Option2 Value": currentOption2Value,
              "Option3 Name": "",
              "Option3 Value": "",
              "Variant SKU": extractSKU(page.url()),
              "Variant Grams": "",
              "Variant Price": variantPrice,
              "Variant Compare At Price": compareAtPrice,
              "Variant Cost": costPerItem, // This is your internal cost
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
      if (!option1Name) option1Name = "Size"; // Fallback if name not found

      for (let i = 0; i < sizeChipLabels.length; i++) {
        const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeChipLabels[i];

        if (!sizeLabel) {
            console.warn(`Size label at index ${i} not found, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null);
        if (!isSizeSelected) {
          console.log(`Clicking size chip for index ${i}...`);
          await sizeLabel.click();
          await page.waitForTimeout(1000); // Small delay for price/stock to update
        } else {
          console.log(`Size chip for index ${i} already selected.`);
        }

        const currentOption1Value = await sizeLabel.evaluate(el => el.textContent.trim());
        const mainImage = await extractMainImage(page);
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