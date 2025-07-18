// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js'; // Ensure VARIANT_PRICE_RATE is imported if used here directly, though calculatePrices handles it now.

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
    ).catch(() => "");
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = await page.$eval(SELECTORS.PRODUCT.TITLE_NAME, (el) =>
      el.textContent.trim()
    ).catch(() => "");
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
 * Extracts the "cost per item" from the website, which is identified as the
 * original/strike-through price based on your provided selector.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The raw text of the displayed cost per item (e.g., "$100.00").
 */
export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 10000 });
    const costText = await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
    return costText;
  } catch (error) {
    console.warn("⚠️ Could not extract displayed cost per item (original/strike price):", error.message);
    return "";
  }
}

/**
 * Extracts the main product image URL.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The image URL.
 */
export async function extractMainImage(page) {
  try {
    // Wait for the picture element or its direct img child
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
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { state: 'visible', timeout: 15000 });

    const breadcrumbs = await page.$$eval(
      SELECTORS.BREADCRUMBS.LINKS,
      (anchors) => {
        return anchors
          .map((a) => {
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(a.cloneNode(true));
            tempDiv.querySelectorAll('svg, .separator-icon').forEach(el => el.remove());

            let text = tempDiv.textContent.trim();
            if (text && text.toLowerCase() !== 'home') {
              return text.replace(/,/g, ',');
            }
            return null;
          })
          .filter(Boolean)
          .join(",");
      }
    );
    console.log("Extracted breadcrumbs:", breadcrumbs);
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
    const descriptionButton = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first();
    if (descriptionButton && await descriptionButton.isVisible()) {
      console.log("Clicking description/details button...");
      await descriptionButton.click();
      await page.waitForTimeout(1000);
    } else {
        console.log("Description button not found or not visible, proceeding without click.");
    }

    // --- Step 2: Extract the main product description paragraph ---
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      const mainDescriptionEl = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
      if (mainDescriptionEl) {
        fullDescriptionHtml += await mainDescriptionEl.evaluate(el => el.outerHTML);
        console.log("Extracted main description paragraph.");
      } else {
        console.warn("⚠️ Main description paragraph not found within container.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract main description content:", error.message);
    }

    // --- Step 3: Extract ul > li.column elements, excluding the last child ---
    try {
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        const itemsToExtract = listItems.slice(0, listItems.length - 1);
        let listHtml = '<ul>';
        for (const item of itemsToExtract) {
          listHtml += await item.evaluate(el => el.outerHTML);
        }
        listHtml += '</ul>';
        fullDescriptionHtml += listHtml;
        console.log(`Extracted ${itemsToExtract.length} list items (excluding the last one).`);
      } else {
        console.log("No specific list items (ul > li.column) found for description.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract list items:", error.message);
    }

    // --- Step 4: Extract Features section (if still relevant) ---
    try {
      const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
      if (featuresSection && await featuresSection.isVisible()) {
        const featuresHtml = await featuresSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += featuresHtml;
        console.log("Extracted features section.");
      } else {
        console.log("Features section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract features section:", error.message);
    }

    // --- Step 5: Extract Shipping & Returns section (if still relevant) ---
    try {
      const shippingReturnsSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
      if (shippingReturnsSection && await shippingReturnsSection.isVisible()) {
        const shippingReturnsHtml = await shippingReturnsSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += shippingReturnsHtml;
        console.log("Extracted shipping & returns section.");
      } else {
        console.log("Shipping & Returns section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract shipping & returns section:", error.message);
    }

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
  }
  await page.waitForTimeout(1000);
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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

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

    const colorOptionNameEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
    if (colorOptionNameEl) {
      option1Name = (await colorOptionNameEl.textContent()).replace(':', '').trim();
    } else {
        console.warn("⚠️ Could not find Color Option Name, defaulting to 'Color'.");
        option1Name = "Color";
    }

    const sizeOptionNameEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
    if (sizeOptionNameEl) {
      option2Name = (await sizeOptionNameEl.textContent()).replace(':', '').trim();
    } else {
        console.warn("⚠️ Could not find Size Option Name, defaulting to 'Size'.");
        option2Name = "Size";
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

        const isColorSelected = await colorLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected'));
        if (!isColorSelected) {
          console.log(`Clicking color swatch for index ${i}...`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500); // Give time for price/stock to update
        } else {
          console.log(`Color swatch for index ${i} already selected.`);
        }

        // Extract the actual color value from the specific display element if available, or fallback to label text
        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(() => colorLabel.evaluate(el => el.querySelector('img')?.alt || el.ariaLabel?.replace('Color: ', '').trim() || el.textContent.trim()));

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

            const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected'));
            if (!isSizeSelected) {
              console.log(`Clicking size chip for index ${j} for color "${currentOption1Value}"...`);
              await sizeLabel.click();
              await page.waitForTimeout(1000);
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected.`);
            }

            // Extract the actual size value from the specific display element if available, or fallback to label text
            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                        .catch(() => sizeLabel.evaluate(el => el.textContent.trim()));

            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

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
              //"Variant Compare At Price": compareAtPrice,
              "Costper Item": costPerItem,
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
              //"Compare At Price": compareAtPrice,
              "original_product_url": url,
            });
          }
        } else { // No size variants, only color
          const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

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
           // "Variant Compare At Price": compareAtPrice,
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
            //"Compare At Price": compareAtPrice,
            "original_product_url": url,
          });
        }
      }
    } else if (sizeChipLabels.length > 0) { // Product has only sizes (master variant)
      console.log(`🔎 Found ${sizeChipLabels.length} sizes (no colors).`);
      if (!option1Name) option1Name = "Size";

      for (let i = 0; i < sizeChipLabels.length; i++) {
        const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeChipLabels[i];

        if (!sizeLabel) {
            console.warn(`Size label at index ${i} not found, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected'));
        if (!isSizeSelected) {
          console.log(`Clicking size chip for index ${i}...`);
          await sizeLabel.click();
          await page.waitForTimeout(1000);
        } else {
          console.log(`Size chip for index ${i} already selected.`);
        }

        // Extract the actual size value from the specific display element if available, or fallback to label text
        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(() => sizeLabel.evaluate(el => el.textContent.trim()));

        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice} = calculatePrices(displayedCostPerItemText);

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
          //"Compare At Price": compareAtPrice,
          "original_product_url": url,
        });
      }
    } else { // No variants
      console.log("🔎 No variants found for this product.");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

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
        //"Variant Compare At Price": compareAtPrice,
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
        //"Compare At Price": compareAtPrice,
        "original_product_url": url,
      });
    }
    return allShopifyRows;
  } catch (error) {
    console.error(`❌ Error in extractMacyProductData for ${url}:`, error.message);
    throw error;
  }
}