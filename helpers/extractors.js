// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js';

/**
 * Safely clicks an element, attempting a forced click first, then a JavaScript click if needed.
 * @param {import('playwright').Locator | import('playwright').ElementHandle} element - The Playwright Locator or ElementHandle to click.
 * @param {number} [timeout=10000] - Maximum time to wait for the click to complete.
 */
async function safeClick(element, timeout = 10000) {
  try {
    // Attempt a forced click directly on the element handle or locator
    await element.click({ force: true, timeout });
  } catch (error) {
    console.warn(`⚠️ Standard click failed for element, trying JavaScript click. Error: ${error.message}`);
    try {
      // Fallback to JavaScript click if Playwright's click fails
      await element.evaluate(el => el.click());
    } catch (jsClickError) {
      console.error(`❌ JavaScript click also failed for element. Error: ${jsClickError.message}`);
      throw jsClickError; // Re-throw if both methods fail
    }
  }
}

/**
 * Extracts the brand and product name from the title elements and formats them.
 * @param {import('playwright').Page} page
 * @returns {Promise<{brand: string, productName: string, title: string}>}
 */
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";

  try {
    brand = await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND)?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = await page.textContent(SELECTORS.PRODUCT.TITLE_NAME)?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }

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
 * Extracts the "cost per item" from the website, prioritizing original/strike-through price, then current price.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The raw text of the displayed cost per item (e.g., "$100.00").
 */
export async function extractDisplayedCostPerItem(page) {
  let costText = "";
  try {
    // Try to get original/strike price first
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 5000 });
    costText = await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
    console.log(`Extracted original/strike price: ${costText}`);
    return costText;
  } catch (error) {
    console.warn("⚠️ Could not extract displayed original/strike price, trying current price:", error.message);
    try {
      // Fallback to current price if original/strike price is not found
      await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { state: 'visible', timeout: 5000 });
      costText = await page.$eval(SELECTORS.PRODUCT.CURRENT_PRICE, el => el.textContent.trim());
      console.log(`ℹ️ Falling back to current price: ${costText}`);
      return costText;
    } catch (currentPriceError) {
      console.warn("⚠️ Could not extract any price, defaulting to '$0.00':", currentPriceError.message);
      return "$0.00"; // Return a default string for consistency
    }
  }
}

/**
 * Extracts the main product image URL.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The image URL or an empty string.
 */
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { state: 'visible', timeout: 5000 });
    // Prefer data-src if available, otherwise fall back to src
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, el => el.dataset.src || el.src || '');
    return imageUrl;
  } catch (error) {
    console.warn("⚠️ Could not extract main image:", error.message);
    return "";
  }
}

/**
 * Extracts breadcrumb links and formats them as a " > " separated string.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} " > " separated breadcrumbs.
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
            // Remove SVG elements and specific separator icons within the cloned anchor
            tempDiv.querySelectorAll('svg, .separator-icon, .breadcrumb-icon').forEach(el => el.remove());

            let text = tempDiv.textContent.trim();
            // Exclude 'Home' and any empty strings after trimming
            if (text && text.toLowerCase() !== 'home') {
              return text;
            }
            return null;
          })
          .filter(Boolean)
          .join(" > "); // Changed join to " > " for better semantic separation of breadcrumbs
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
      await safeClick(descriptionButton);
      await page.waitForTimeout(1000); // Give time for content to expand
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
        console.warn("⚠️ Main description paragraph not found within container, trying fallback.");
      }
    } catch (error) {
      console.warn("⚠️ Error waiting for/extracting main description content:", error.message);
    }

    // --- Step 3: Extract ul > li.column elements, excluding the last child (often a "show more" or "find in store" link) ---
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        // Exclude the last child which is often an interactive link and not part of the description
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

    // --- Step 4: Extract Features section ---
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

    // --- Step 5: Extract Shipping & Returns section ---
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

    // Fallback if main parts are empty, try to get anything from the container
    if (!fullDescriptionHtml.trim()) {
        const fallbackContainer = await page.$(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER);
        if (fallbackContainer) {
            fullDescriptionHtml = await fallbackContainer.innerHTML();
            console.warn("ℹ️ Fallback: Extracted all content from description container.");
        }
    }

  } catch (error) {
    console.error("❌ Error in extractFullDescription:", error.message);
  }
  return fullDescriptionHtml.trim();
}

/**
 * Waits for a potential image change after clicking a variant.
 * Scrolls the element into view and performs a forced click.
 * @param {object} options
 * @param {import('playwright').Page} options.page
 * @param {import('playwright').ElementHandle} options.anchorToClick
 */
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page);

  if (anchorToClick) {
    // Scroll the element into view before clicking for better reliability
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  }

  await safeClick(anchorToClick);
  console.log("Waiting for image change or variant update...");
  
  try {
    // Wait for the main image's src or data-src to change
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currImageElement = document.querySelector(selector);
        const currMainImageSrc = currImageElement?.src;
        const currMainImageDataSrc = currImageElement?.dataset.src;
        // Consider both src and data-src for comparison
        if ((currMainImageSrc && currMainImageSrc !== prevMainImage) || (currMainImageDataSrc && currMainImageDataSrc !== prevMainImage)) return true;
        return false;
      },
      oldMainImage,
      SELECTORS.PRODUCT.MAIN_IMAGE,
      { timeout: 10000 } // Increased timeout for image change
    );
    console.log("✅ Image changed successfully.");
  } catch (err) {
    console.warn("⚠️ Image did not change or timed out after variant click, proceeding anyway:", err.message);
  }
  await page.waitForTimeout(1500); // Give a little extra time for the page to settle after a variant change
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
    await page.waitForTimeout(5000); // Increased initial wait for more stability

    // --- CRITICAL: Inject CSS to hide common intercepting elements ---
    try {
      console.log("Attempting to hide potential intercepting elements...");
      await page.addStyleTag({
        content: `
          /* Aggressive hiding for common overlays and fixed/sticky elements that block clicks */
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar, #teleported,
          .modal-overlay, .modal-dialog,
          .loyalty-banner, .toast-notification,
          #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .enhanced-offer-banner, .interstitial-modal, .cookie-banner, .footer-container,
          /* Additional Macy's specific elements that might overlay */
          .full-width-overlay, .overlay-backdrop, .atc-flyout,
          /* Ensure no remnants of modals or overlays by targeting common modal/overlay attributes/classes */
          [aria-modal="true"], .pl-modal, .pl-overlay,
          /* Specific Macy's pop-ups that appear */
          .marketing-modal-wrapper, .modal-open {
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
            opacity: 0 !important;
            display: none !important; /* Strongest hide option to prevent layout shifts */
          }
          /* Ensure the main content and variants are interactable by making body scrollable if needed */
          body { overflow: auto !important; }
        `
      });
      console.log("Potential intercepting elements hidden.");
    } catch (styleError) {
      console.warn("⚠️ Could not apply style to hide elements:", styleError.message);
    }
    // --- END CRITICAL INJECTION ---

    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(" > ").map(tag => tag.trim()), // Use " > " for splitting breadcrumbs
        ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
      ]),
    ]
      .filter(Boolean)
      .join(", "); // Join tags with a comma for Shopify

    let option1Name = "";
    let option2Name = "";

    // More robust way to find option names, looking for labels that indicate 'Color' or 'Size'
    // Prioritize specific data-auto attributes, then general form labels/legends
    const optionNameElements = await page.$$('legend.form-label, span.updated-label.label, [data-auto*="-picker-label"], .variant-selector__label');
    for (const el of optionNameElements) {
        const text = await el.textContent();
        if (text && text.toLowerCase().includes('color') && !option1Name) {
            option1Name = text.replace(':', '').trim();
        } else if (text && text.toLowerCase().includes('size') && !option2Name) {
            option2Name = text.replace(':', '').trim();
        }
    }
    if (!option1Name) option1Name = "Color"; // Fallback if no specific color label found
    if (!option2Name) option2Name = "Size"; // Fallback if no specific size label found


    let colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    let sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    if (colorSwatchLabels.length > 0) {
      console.log(`🔎 Found ${colorSwatchLabels.length} colors.`);
      for (let i = 0; i < colorSwatchLabels.length; i++) {
        // !!! IMPORTANT: Re-fetch elements inside the loop to ensure they are fresh and clickable !!!
        const currentColorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
        const colorLabel = currentColorSwatchLabels[i];

        if (!colorLabel) {
            console.warn(`Color label at index ${i} not found during re-fetch, skipping.`);
            continue;
        }

        // Check if color is already selected or disabled. Prioritize 'selected' class or 'aria-checked' attribute.
        const isColorSelected = await colorLabel.evaluate(el => el.classList.contains('selected') || el.classList.contains('color-swatch-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true');
        const isColorDisabled = await colorLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isColorSelected && !isColorDisabled) {
          console.log(`Clicking color swatch for index ${i}...`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500); // Give time for price/stock/sizes to update
        } else {
          console.log(`Color swatch for index ${i} already selected or disabled.`);
          if (isColorDisabled) {
            console.log(`Skipping disabled color: ${await colorLabel.textContent()}`);
            continue; // Skip to the next color if disabled
          }
        }

        // Extract the actual color value from the specific display element if available, or fallback to label text/alt text
        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(async () => {
                                        const altText = await colorLabel.$eval('img', img => img.alt).catch(() => '');
                                        if (altText) return altText;
                                        return (await colorLabel.textContent()).trim() || 'Unknown Color';
                                    });
        console.log(`Current color selected: ${currentOption1Value}`);

        const mainImage = await extractMainImage(page);

        // !!! IMPORTANT: Re-fetch size labels *after* color change as they often depend on color selection !!!
        sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

        if (sizeChipLabels.length > 0) {
          console.log(`🔎 Found ${sizeChipLabels.length} sizes for color "${currentOption1Value}".`);
          for (let j = 0; j < sizeChipLabels.length; j++) {
            // !!! IMPORTANT: Re-fetch elements inside the nested loop too !!!
            const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            const sizeLabel = currentSizeChipLabels[j];

            if (!sizeLabel) {
                console.warn(`Size label at index ${j} not found during re-fetch, skipping.`);
                continue;
            }

            // Check if size is already selected or disabled. Prioritize 'selected' class or 'aria-checked' attribute.
            const isSizeSelected = await sizeLabel.evaluate(el => el.classList.contains('selected') || el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true');
            const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

            if (!isSizeSelected && !isSizeDisabled) {
              console.log(`Clicking size chip for index ${j} for color "${currentOption1Value}"...`);
              await safeClick(sizeLabel);
              await page.waitForTimeout(1000); // Give time for price/stock to update
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected or disabled.`);
              if (isSizeDisabled) {
                console.log(`Skipping disabled size: ${await sizeLabel.textContent()}`);
                continue; // Skip to the next size if disabled
              }
            }

            // Extract the actual size value from the specific display element if available, or fallback to label text
            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                        .catch(async () => (await sizeLabel.textContent()).trim() || 'Unknown Size');
            console.log(`Current size selected: ${currentOption2Value}`);

            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

            allShopifyRows.push(createShopifyRow({
              handle,
              title: allShopifyRows.length === 0 ? title : "",
              descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
              tags: allShopifyRows.length === 0 ? finalProductTags : "",
              option1Name,
              option1Value: currentOption1Value,
              option2Name,
              option2Value: currentOption2Value,
              variantPrice,
              compareAtPrice, // Pass compareAtPrice
              costPerItem,
              mainImage,
              imageAltText: `${title} - ${currentOption1Value} ${currentOption2Value}`,
              url
            }));
          }
        } else { // No size variants, only color
          console.log(`No sizes found for color "${currentOption1Value}", adding as single variant.`);
          const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

          allShopifyRows.push(createShopifyRow({
            handle,
            title: allShopifyRows.length === 0 ? title : "",
            descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
            tags: allShopifyRows.length === 0 ? finalProductTags : "",
            option1Name,
            option1Value: currentOption1Value,
            variantPrice,
            compareAtPrice, // Pass compareAtPrice
            costPerItem,
            mainImage,
            imageAltText: `${title} - ${currentOption1Value}`,
            url
          }));
        }
      }
    } else if (sizeChipLabels.length > 0) { // Product has only sizes (master variant)
      console.log(`🔎 Found ${sizeChipLabels.length} sizes (no colors).`);
      if (!option1Name) option1Name = "Size"; // Ensure option1Name is set if only sizes exist

      for (let i = 0; i < sizeChipLabels.length; i++) {
        // !!! IMPORTANT: Re-fetch elements inside the loop too !!!
        const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeChipLabels[i];

        if (!sizeLabel) {
            console.warn(`Size label at index ${i} not found during re-fetch, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabel.evaluate(el => el.classList.contains('selected') || el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true');
        const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isSizeSelected && !isSizeDisabled) {
          console.log(`Clicking size chip for index ${i}...`);
          await safeClick(sizeLabel);
          await page.waitForTimeout(1000);
        } else {
          console.log(`Size chip for index ${i} already selected or disabled.`);
          if (isSizeDisabled) {
            console.log(`Skipping disabled size: ${await sizeLabel.textContent()}`);
            continue;
          }
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(async () => (await sizeLabel.textContent()).trim() || 'Unknown Size');
        console.log(`Current size selected: ${currentOption1Value}`);

        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

        allShopifyRows.push(createShopifyRow({
          handle,
          title: allShopifyRows.length === 0 ? title : "",
          descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
          tags: allShopifyRows.length === 0 ? finalProductTags : "",
          option1Name,
          option1Value: currentOption1Value,
          variantPrice,
          compareAtPrice, // Pass compareAtPrice
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${currentOption1Value}`,
          url
        }));
      }
    } else { // No variants (single product)
      console.log("🔎 No variants found for this product.");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

      allShopifyRows.push(createShopifyRow({
        handle,
        title,
        descriptionHtml,
        tags: finalProductTags,
        variantPrice,
        compareAtPrice, // Pass compareAtPrice
        costPerItem,
        mainImage,
        imageAltText: title,
        url
      }));
    }

    return allShopifyRows;
  } catch (error) {
    console.error(`❌ Error in extractMacyProductData for ${url}:`, error.message);
    throw error;
  }
}

/**
 * Creates a Shopify-formatted product row object.
 * @param {object} params - Parameters for the Shopify row.
 * @returns {object} A Shopify-formatted row.
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
  compareAtPrice, // Added compareAtPrice to params
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
    "Type": "Footwear", // Hardcoded as per your example, consider making dynamic
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
    "Variant Compare At Price": compareAtPrice, // Ensure this is correctly mapped
    "Variant Cost": costPerItem,
    "Variant Taggable": "",
    "Variant Taxable": "TRUE",
    "Variant Barcode": "",
    "Image Src": mainImage,
    "Image Position": 1,
    "Image Alt Text": imageAltText,
    "Gift Card": "FALSE",
    "SEO Title": "",
    "SEO Description": "",
    "Google Shopping / Google Product Category": "", // Consider making dynamic
    "Google Shopping / Gender": "", // Consider making dynamic
    "Google Shopping / Age Group": "", // Consider making dynamic
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
    "Variant Weight Unit": "oz", // Consider making dynamic
    "Variant Tax Code": "",
    "Cost per item": costPerItem,
    "Price": variantPrice,
    "Compare At Price": compareAtPrice, // Ensure this is correctly mapped
    "original_product_url": url,
  };
}