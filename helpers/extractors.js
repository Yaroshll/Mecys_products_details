// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js'; // Ensure constants.js is correctly defined

/**
 * Safely clicks an element, attempting a forced click first, then a JavaScript click if needed.
 * Logs warnings for failures but attempts to recover.
 * @param {import('playwright').Locator | import('playwright').ElementHandle} element - The Playwright Locator or ElementHandle to click.
 * @param {number} [timeout=10000] - Maximum time to wait for the click to complete.
 */
async function safeClick(element, timeout = 10000) {
  try {
    // Attempt a forced click directly on the element. This often bypasses overlays.
    await element.click({ force: true, timeout });
    // console.log("✅ Standard forced click successful.");
  } catch (error) {
    console.warn(`⚠️ Standard click failed for element, attempting JavaScript click. Error: ${error.message}`);
    try {
      // Fallback to JavaScript click if Playwright's click fails
      await element.evaluate(el => el.click());
      // console.log("✅ JavaScript click successful.");
    } catch (jsClickError) {
      console.error(`❌ Both standard and JavaScript clicks failed for element. Error: ${jsClickError.message}`);
      throw jsClickError; // Re-throw if both methods fail to signal a critical issue
    }
  }
}

/**
 * Extracts the brand and product name from the title elements and formats them.
 * Handles cases where one or both might be missing.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<{brand: string, productName: string, title: string}>}
 */
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";

  try {
    // Using page.textContent directly with optional chaining for robustness
    brand = (await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND))?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = (await page.textContent(SELECTORS.PRODUCT.TITLE_NAME))?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }

  // Construct the title based on what's available
  if (brand && productName) {
    title = `${brand}, ${productName}`;
  } else if (brand) {
    title = brand;
  } else if (productName) {
    title = productName;
  } else {
    console.warn("⚠️ Could not extract brand or product name, title will be empty.");
  }

  console.log(`Extracted Title: Brand='${brand}', Product Name='${productName}', Full Title='${title}'`);
  return { brand, productName, title };
}

/**
 * Extracts the "cost per item" from the website, prioritizing original/strike-through price, then current price.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The raw text of the displayed cost per item (e.g., "$100.00"). Returns "$0.00" on failure.
 */
export async function extractDisplayedCostPerItem(page) {
  let costText = "";
  try {
    // Attempt to get the original/strike price first, as this is often the "cost per item" for Shopify
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 3000 });
    costText = await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
    console.log(`Extracted original/strike price: ${costText}`);
    return costText;
  } catch (error) {
    console.warn("⚠️ Could not extract original/strike price, trying current price:", error.message);
    try {
      // Fallback to the current selling price if original/strike price is not found
      await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { state: 'visible', timeout: 3000 });
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
 * Extracts the main product image URL. Prioritizes 'data-src' attribute, then 'src'.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The image URL or an empty string if not found.
 */
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { state: 'visible', timeout: 5000 });
    // Prefer data-src attribute if available (common for lazy-loaded images), otherwise fall back to src
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, el => el.dataset.src || el.src || '');
    return imageUrl;
  } catch (error) {
    console.warn("⚠️ Could not extract main image:", error.message);
    return "";
  }
}

/**
 * Extracts breadcrumb links and formats them as a " > " separated string.
 * Filters out "Home" and any empty segments.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} " > " separated breadcrumbs. Returns an empty string on failure.
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
            // Remove SVG elements, specific separator icons, and other non-text elements within the breadcrumb link
            tempDiv.querySelectorAll('svg, .separator-icon, .breadcrumb-icon, [data-auto="icon"]').forEach(el => el.remove());

            let text = tempDiv.textContent.trim();
            // Exclude 'Home' and any empty strings after trimming
            if (text && text.toLowerCase() !== 'home') {
              return text;
            }
            return null; // Return null for elements to be filtered out
          })
          .filter(Boolean) // Remove nulls and undefineds
          .join(" > "); // Join with " > " for better visual separation in breadcrumbs
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
 * Extracts the full product description including main paragraph, list items, features, and shipping info.
 * Handles clicking a "description" button if present.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} Combined HTML description. Returns an empty string on total failure.
 */
export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    // Step 1: Click the description/details button if it exists and is visible to reveal content
    const descriptionButton = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first();
    if (descriptionButton && await descriptionButton.isVisible({ timeout: 3000 })) {
      console.log("Clicking description/details button to expand content...");
      await safeClick(descriptionButton);
      await page.waitForTimeout(1000); // Give time for content to expand or load
    } else {
        console.log("Description button not found or not visible, proceeding without clicking.");
    }

    // Step 2: Extract the main product description paragraph
    try {
      // Wait for the main description container to be visible
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      const mainDescriptionEl = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
      if (mainDescriptionEl) {
        fullDescriptionHtml += await mainDescriptionEl.evaluate(el => el.outerHTML);
        console.log("Extracted main description paragraph.");
      } else {
        console.warn("⚠️ Main description paragraph element not found.");
      }
    } catch (error) {
      console.warn("⚠️ Error waiting for/extracting main description paragraph:", error.message);
    }

    // Step 3: Extract list items (often features or bullet points), excluding the last child if it's an interactive link
    try {
      // Ensure the container is visible before attempting to find list items
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 3000 });
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        // Assume the last list item might be a "show more" or "find in store" link, so exclude it
        const itemsToExtract = listItems.slice(0, listItems.length - 1);
        let listHtml = '<ul>';
        for (const item of itemsToExtract) {
          listHtml += await item.evaluate(el => el.outerHTML);
        }
        listHtml += '</ul>';
        fullDescriptionHtml += listHtml;
        console.log(`Extracted ${itemsToExtract.length} list items.`);
      } else {
        console.log("No specific list items (ul > li.column) found for description.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract list items (likely not present):", error.message);
    }

    // Step 4: Extract Features section (if it's a separate section)
    try {
      const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
      if (featuresSection && await featuresSection.isVisible({ timeout: 2000 })) {
        const featuresHtml = await featuresSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += featuresHtml;
        console.log("Extracted features section.");
      } else {
        console.log("Features section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract features section:", error.message);
    }

    // Step 5: Extract Shipping & Returns section (if it's a separate section)
    try {
      const shippingReturnsSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
      if (shippingReturnsSection && await shippingReturnsSection.isVisible({ timeout: 2000 })) {
        const shippingReturnsHtml = await shippingReturnsSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += shippingReturnsHtml;
        console.log("Extracted shipping & returns section.");
      } else {
        console.log("Shipping & Returns section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract shipping & returns section:", error.message);
    }

    // Fallback: If no specific sections were found, try to grab the entire content of the main description container
    if (!fullDescriptionHtml.trim()) {
        const fallbackContainer = await page.$(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER);
        if (fallbackContainer) {
            fullDescriptionHtml = await fallbackContainer.innerHTML();
            console.warn("ℹ️ Fallback: No specific description elements found, extracted all content from the main description container.");
        }
    }

  } catch (error) {
    console.error("❌ Major error in extractFullDescription:", error.message);
  }
  return fullDescriptionHtml.trim();
}

/**
 * Waits for a potential main product image change after a variant click.
 * Scrolls the anchor into view and performs a safe click.
 * @param {object} options - Options object.
 * @param {import('playwright').Page} options.page - The Playwright page object.
 * @param {import('playwright').ElementHandle} options.anchorToClick - The element handle to click.
 */
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page); // Get the current main image URL

  if (anchorToClick) {
    // Scroll the element into view instantly to ensure it's clickable and visible
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  }

  await safeClick(anchorToClick); // Perform the click on the variant
  console.log("Waiting for image change or variant data update...");
  
  try {
    // Wait for the main image's src or data-src attribute to change
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currImageElement = document.querySelector(selector);
        // Check both src and data-src as images might use lazy loading
        const currMainImageSrc = currImageElement?.src;
        const currMainImageDataSrc = currImageElement?.dataset.src;
        // Return true if either src or data-src has changed from the previous image
        return (currMainImageSrc && currMainImageSrc !== prevMainImage) || (currMainImageDataSrc && currMainImageDataSrc !== prevMainImage);
      },
      oldMainImage, // Pass the old image URL to the function context
      SELECTORS.PRODUCT.MAIN_IMAGE, // Pass the selector to the function context
      { timeout: 10000 } // Increased timeout for image change to accommodate network latency
    );
    console.log("✅ Main image updated successfully after variant selection.");
  } catch (err) {
    console.warn("⚠️ Main image did not change or timed out after variant click. This might be expected if only price/stock updates, or could indicate an issue:", err.message);
  }
  await page.waitForTimeout(2000); // Give a little extra time for the page to fully settle and prices/stock to load
}

/**
 * Extracts the value of the currently selected color.
 * Prioritizes a dedicated display element, then image alt, then aria-label, then text content of the swatch.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The value of the selected color.
 */
async function getSelectedColorValue(page) {
    try {
        // Try to get from the dedicated display element first (most reliable)
        return await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim());
    } catch (e) {
        // Fallback: Try to find the currently selected color swatch and extract its value
        const selectedSwatch = await page.$(
            `${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}[aria-checked="true"], ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}.selected, ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}.color-swatch-selected`
        );
        if (selectedSwatch) {
            const imgAlt = await selectedSwatch.$eval('img', img => img.alt).catch(() => '');
            if (imgAlt) return imgAlt.replace('Color: ', '').trim();
            const ariaLabel = await selectedSwatch.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel.replace('Color: ', '').trim();
            return (await selectedSwatch.textContent()).trim();
        }
    }
    return 'Unknown Color';
}

/**
 * Extracts the value of the currently selected size.
 * Prioritizes a dedicated display element, then text content of the chip.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The value of the selected size.
 */
async function getSelectedSizeValue(page) {
    try {
        // Try to get from the dedicated display element first (most reliable)
        return await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim());
    } catch (e) {
        // Fallback: Try to find the currently selected size chip and extract its value
        const selectedChip = await page.$(
            `${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}[aria-checked="true"], ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}.selected, ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}.selection-tile-selected`
        );
        if (selectedChip) {
            return (await selectedChip.textContent()).trim();
        }
    }
    return 'Unknown Size';
}


/**
 * Extracts all product data from a Macy's product page, handling variants (colors and sizes).
 * Iterates through all available variants and creates Shopify-compatible rows.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @param {string} url - The URL of the product to scrape.
 * @param {string} extraTags - Comma-separated string of additional tags to apply to the product.
 * @returns {Promise<Array<object>>} An array of Shopify-formatted product row objects.
 */
export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];

  try {
    await gotoMacyWithRetries(page, url); // Navigate to the product URL
    console.info("✅ Page navigated successfully. Waiting for full page load and stability...");
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000); // Initial wait for JavaScript to execute and page to render

    // --- CRITICAL: Inject CSS to aggressively hide common overlays and fixed elements ---
    try {
      console.log("Injecting CSS to hide potential intercepting elements...");
      await page.addStyleTag({
        content: `
          /* General aggressive hiding for common overlays, modals, and sticky banners */
          .modal-overlay, .modal-dialog, #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .loyalty-banner, .toast-notification, .cookie-banner, .interstitial-modal, .marketing-modal-wrapper,
          /* Macy's specific overlays/sticky elements */
          .full-width-overlay, .overlay-backdrop, .atc-flyout,
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar,
          .enhanced-offer-banner, .footer-container, [data-auto="added-to-bag-modal"],
          /* Ensure the body is scrollable if an overlay prevents it */
          body.modal-open, html.no-scroll { overflow: auto !important; }

          /* Apply strong hiding properties */
          .modal-overlay, .modal-dialog, #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .loyalty-banner, .toast-notification, .cookie-banner, .interstitial-modal, .marketing-modal-wrapper,
          .full-width-overlay, .overlay-backdrop, .atc-flyout,
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar,
          .enhanced-offer-banner, .footer-container, [data-auto="added-to-bag-modal"] {
            visibility: hidden !important;
            pointer-events: none !important; /* Prevents interaction */
            height: 0 !important; /* Collapse the element */
            width: 0 !important;
            overflow: hidden !important; /* Hide any content overflow */
            opacity: 0 !important; /* Make it completely transparent */
            display: none !important; /* Remove from flow to prevent layout shifts */
          }
        `
      });
      console.log("✅ CSS injected to hide potential intercepting elements.");
      await page.waitForTimeout(1000); // Give the CSS a moment to apply
    } catch (styleError) {
      console.warn("⚠️ Could not apply style tag to hide elements, proceeding anyway:", styleError.message);
    }
    // --- END CRITICAL INJECTION ---

    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    // Combine and unique product tags
    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(" > ").map(tag => tag.trim()).filter(Boolean),
        ...(extraTags ? extraTags.split(",").map(tag => tag.trim()).filter(Boolean) : []),
      ]),
    ].join(", ");

    let option1Name = "";
    let option2Name = "";

    // Dynamically determine option names (e.g., "Color", "Size") from the page
    const optionNameElements = await page.$$('legend.form-label, span.updated-label.label, [data-auto*="-picker-label"], .variant-selector__label, .product-attribute-label');
    for (const el of optionNameElements) {
        const text = (await el.textContent())?.replace(':', '').trim();
        if (text) {
            if (text.toLowerCase().includes('color') && !option1Name) {
                option1Name = text;
            } else if (text.toLowerCase().includes('size') && !option2Name) {
                option2Name = text;
            }
        }
    }
    if (!option1Name) option1Name = "Color";
    if (!option2Name) option2Name = "Size";
    console.log(`Determined Option Names: Option1: '${option1Name}', Option2: '${option2Name}'`);

    // --- Start Variant Handling ---
    let colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    let sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    if (colorSwatchLabels.length > 0) {
      console.log(`--- Found ${colorSwatchLabels.length} color variants ---`);

      // Store initial state of all color swatches to iterate reliably
      const colorsToProcess = [];
      for (const label of colorSwatchLabels) {
          const value = await label.evaluate(el => el.querySelector('img')?.alt || el.ariaLabel || el.textContent || '');
          const isDisabled = await label.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.classList.contains('unavailable'));
          // Only add if not explicitly empty or just whitespace after cleanup
          if (value.trim() && !isDisabled) {
              colorsToProcess.push({ element: label, value: value.replace('Color: ', '').trim() });
          } else if (isDisabled) {
              console.log(`Skipping disabled color: ${value.trim() || 'N/A'}`);
          }
      }
      
      console.log(`Will process ${colorsToProcess.length} available colors.`);

      for (let i = 0; i < colorsToProcess.length; i++) {
        // Re-fetch the specific color element using its value or a more robust locator
        const targetColorValue = colorsToProcess[i].value;
        const colorLabelToClick = await page.locator(`
            ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}[aria-label*="${targetColorValue}" i],
            ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS} img[alt*="${targetColorValue}" i] >> xpath=ancestor::label,
            ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}:has-text("${targetColorValue}" i)
        `).first();

        if (!colorLabelToClick || !(await colorLabelToClick.isVisible())) {
            console.warn(`Could not find clickable element for color: ${targetColorValue}, skipping.`);
            continue;
        }

        const isColorSelected = await colorLabelToClick.evaluate(el =>
          el.classList.contains('selected') || el.classList.contains('color-swatch-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true'
        );

        if (!isColorSelected) {
          console.log(`Clicking color swatch for: '${targetColorValue}' (${i + 1}/${colorsToProcess.length}).`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabelToClick });
          await page.waitForTimeout(2000); // Give extra time for UI to update after color change
        } else {
          console.log(`Color swatch for: '${targetColorValue}' (${i + 1}/${colorsToProcess.length}) is already selected, proceeding.`);
          await page.waitForTimeout(1000); // Small wait even if selected to ensure stability
        }
        
        // Ensure we capture the currently selected color value from the page after interaction
        let currentOption1Value = await getSelectedColorValue(page);
        console.log(`Confirmed current Color: '${currentOption1Value}'`);

        const mainImage = await extractMainImage(page);

        // !!! CRITICAL: Re-fetch size elements *after* each color change !!!
        // Sizes often dynamically update based on the selected color.
        let currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        
        const sizesToProcess = [];
        for (const label of currentSizeChipLabels) {
            const value = await label.textContent().trim();
            const isDisabled = await label.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.classList.contains('unavailable'));
            if (value && !isDisabled) {
                sizesToProcess.push({ element: label, value: value });
            } else if (isDisabled) {
                console.log(`Skipping disabled size: ${value || 'N/A'}`);
            }
        }
        
        if (sizesToProcess.length > 0) {
          console.log(`--- Found ${sizesToProcess.length} available sizes for color "${currentOption1Value}" ---`);

          for (let j = 0; j < sizesToProcess.length; j++) {
            // Re-fetch the specific size element to ensure it's current
            const targetSizeValue = sizesToProcess[j].value;
            const sizeLabelToClick = await page.locator(`
                ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}:has-text("${targetSizeValue}" i)[role="radio"],
                ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}:has-text("${targetSizeValue}" i) input[type="radio"] >> xpath=ancestor::label
            `).first();

            if (!sizeLabelToClick || !(await sizeLabelToClick.isVisible())) {
                console.warn(`Could not find clickable element for size: ${targetSizeValue} for color ${currentOption1Value}, skipping.`);
                continue;
            }

            const isSizeSelected = await sizeLabelToClick.evaluate(el =>
              el.classList.contains('selected') || el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true'
            );

            if (!isSizeSelected) {
              console.log(`Clicking size chip for: '${targetSizeValue}' (${j + 1}/${sizesToProcess.length}) for color "${currentOption1Value}".`);
              await safeClick(sizeLabelToClick);
              await page.waitForTimeout(1000); // Give time for price/stock to update
            } else {
              console.log(`Size chip for: '${targetSizeValue}' (${j + 1}/${sizesToProcess.length}) for color "${currentOption1Value}" is already selected, proceeding.`);
              await page.waitForTimeout(500);
            }

            let currentOption2Value = await getSelectedSizeValue(page);
            console.log(`Confirmed current Size: '${currentOption2Value}' for color '${currentOption1Value}'`);

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
              compareAtPrice,
              costPerItem,
              mainImage,
              imageAltText: `${title} - ${currentOption1Value} ${currentOption2Value}`,
              url
            }));
          }
        } else {
          // Case: Product has colors but no sizes for that color (or no size variants at all)
          console.log(`No explicit sizes found for color "${currentOption1Value}". Adding as a single color variant.`);
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
            compareAtPrice,
            costPerItem,
            mainImage,
            imageAltText: `${title} - ${currentOption1Value}`,
            url
          }));
        }
      }
    } else if (sizeChipLabels.length > 0) {
      // Case: Product has only sizes, no colors (master variant)
      console.log(`--- Found ${sizeChipLabels.length} size variants (no colors) ---`);
      if (!option1Name) option1Name = "Size";

      const sizesToProcess = [];
      for (const label of sizeChipLabels) {
          const value = await label.textContent().trim();
          const isDisabled = await label.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.classList.contains('unavailable'));
          if (value && !isDisabled) {
              sizesToProcess.push({ element: label, value: value });
          } else if (isDisabled) {
              console.log(`Skipping disabled size: ${value || 'N/A'}`);
          }
      }

      for (let i = 0; i < sizesToProcess.length; i++) {
        // Re-fetch the specific size element to ensure it's current
        const targetSizeValue = sizesToProcess[i].value;
        const sizeLabelToClick = await page.locator(`
            ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}:has-text("${targetSizeValue}" i)[role="radio"],
            ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}:has-text("${targetSizeValue}" i) input[type="radio"] >> xpath=ancestor::label
        `).first();

        if (!sizeLabelToClick || !(await sizeLabelToClick.isVisible())) {
            console.warn(`Could not find clickable element for size: ${targetSizeValue}, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabelToClick.evaluate(el =>
          el.classList.contains('selected') || el.classList.contains('selection-tile-selected') || el.querySelector('input[type="radio"]:checked') !== null || el.getAttribute('aria-checked') === 'true'
        );

        if (!isSizeSelected) {
          console.log(`Clicking size chip for: '${targetSizeValue}' (${i + 1}/${sizesToProcess.length}).`);
          await safeClick(sizeLabelToClick);
          await page.waitForTimeout(1000);
        } else {
          console.log(`Size chip for: '${targetSizeValue}' (${i + 1}/${sizesToProcess.length}) is already selected, proceeding.`);
          await page.waitForTimeout(500);
        }

        let currentOption1Value = await getSelectedSizeValue(page);
        console.log(`Confirmed current Size: '${currentOption1Value}'`);

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
          compareAtPrice,
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${currentOption1Value}`,
          url
        }));
      }
    } else {
      // Case: No variants (single product)
      console.log("--- No variants (colors or sizes) found for this product. Processing as a single product. ---");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedCostPerItemText);

      allShopifyRows.push(createShopifyRow({
        handle,
        title,
        descriptionHtml,
        tags: finalProductTags,
        variantPrice,
        compareAtPrice,
        costPerItem,
        mainImage,
        imageAltText: title,
        url
      }));
    }

    console.log(`✅ Finished extracting data for ${allShopifyRows.length} Shopify rows.`);
    return allShopifyRows;
  } catch (error) {
    console.error(`❌ CRITICAL ERROR in extractMacyProductData for URL: ${url}:`, error);
    throw error;
  }
}

/**
 * Helper function to create a Shopify-formatted product row object.
 * @param {object} params - Parameters for constructing the Shopify row.
 * @returns {object} A complete Shopify-formatted row object.
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
  compareAtPrice,
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
    "Variant Compare At Price": compareAtPrice,
    "Variant Cost": costPerItem,
    "Variant Taxable": "TRUE",
    "Variant Barcode": "",
    "Image Src": mainImage,
    "Image Position": 1,
    "Image Alt Text": imageAltText,
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
  };
}