// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js';

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
    // We are now only looking for the strike-through price as "Cost per item"
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 10000 });
    const costText = await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
    return costText;
  } catch (error) {
    console.warn("⚠️ Could not extract displayed cost per item (original/strike price):", error.message);
    // If original/strike price is not found, try to get the current price as a fallback
    try {
        const currentPriceEl = await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { state: 'visible', timeout: 5000 });
        const currentPriceText = await currentPriceEl.textContent();
        console.log("ℹ️ Falling back to current price for 'Cost per item':", currentPriceText);
        return currentPriceText.trim();
    } catch (currentPriceError) {
        console.warn("⚠️ Could not extract any price, defaulting to empty string:", currentPriceError.message);
        return "";
    }
  }
}

/**
 * Extracts the main product image URL.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} The image URL.
 */
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { state: 'visible', timeout: 5000 });
    // Use $eval directly to get the attribute
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, (img) => img.src || img.dataset.src);
    return imageUrl;
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
            // Remove SVG elements and specific separator icons within the cloned anchor
            tempDiv.querySelectorAll('svg, .separator-icon, .breadcrumb-icon').forEach(el => el.remove());

            let text = tempDiv.textContent.trim();
            // Exclude 'Home' and any empty strings after trimming
            if (text && text.toLowerCase() !== 'home') {
              return text; // Return text as is, join with comma later
            }
            return null;
          })
          .filter(Boolean) // Filter out nulls and empty strings
          .join(" > "); // Changed to " > " as per common breadcrumb formatting
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
      // Using force: true here as it helps with clickable issues
      await descriptionButton.click({ force: true });
      await page.waitForTimeout(1000); // Give time for content to expand
    } else {
        console.log("Description button not found or not visible, proceeding without click.");
    }

    // --- Step 2: Extract the main product description paragraph ---
    try {
      // Ensure the container is visible first
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
      // Re-wait for the content container, just in case
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        // Exclude the last child, which might be a non-descriptive link
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
 * @param {object} options
 * @param {import('playwright').Page} options.page
 * @param {import('playwright').ElementHandle} options.anchorToClick
 */
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page);

  if (anchorToClick) {
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }

  // Add force: true to the click on variant elements for reliability
  await anchorToClick?.click({ force: true, timeout: 10000 });
  console.log("Waiting for image change or variant update...");
  try {
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currMainImage = document.querySelector(selector)?.src;
        // Check both src and data-src as images might load dynamically
        const currDataSrc = document.querySelector(selector)?.dataset.src;
        if ((currMainImage && currMainImage !== prevMainImage) || (currDataSrc && currDataSrc !== prevMainImage)) return true;
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
  await page.waitForTimeout(1000); // Give a little extra time after image change
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
    await page.waitForTimeout(5000); // Increased initial wait to 5 seconds for more stability

    // --- CRITICAL: Re-add aggressive hiding for common intercepting elements ---
    try {
      console.log("Attempting to hide potential intercepting elements...");
      await page.addStyleTag({
        content: `
          /* Aggressive hiding for common overlays and fixed/sticky elements */
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar, #teleported,
          .modal-overlay, .modal-dialog,
          .loyalty-banner, .toast-notification,
          #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .enhanced-offer-banner, .interstitial-modal, .cookie-banner, .footer-container,
          /* Additional Macy's specific elements that might overlay */
          .full-width-overlay, .overlay-backdrop, .atc-flyout,
          /* Ensure no remnants of modals or overlays */
          [aria-modal="true"], .pl-modal, .pl-overlay {
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important; /* Also hide width to avoid horizontal scroll issues */
            overflow: hidden !important;
            opacity: 0 !important;
            display: none !important; /* Strongest hide option */
          }
          /* Ensure the main content and variants are interactable by making body scrollable if needed */
          body { overflow: auto !important; }
        `
      });
      console.log("Potential intercepting elements hidden.");
    } catch (styleError) {
      console.warn("⚠️ Could not apply style to hide elements:", styleError.message);
    }
    // --- END CRITICAL RE-ADD ---


    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(" > ").map(tag => tag.trim()), // Changed split to " > "
        ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
      ]),
    ]
      .filter(Boolean)
      .join(","); // Join with comma as Shopify prefers

    let option1Name = "";
    let option2Name = "";

    // More robust way to find option names, looking for labels that indicate 'Color' or 'Size'
    const optionNameElements = await page.$$('legend.form-label, span.updated-label.label, [data-auto*="-picker-label"], .variant-selector__label');
    for (const el of optionNameElements) {
        const text = await el.textContent();
        if (text && text.toLowerCase().includes('color') && !option1Name) {
            option1Name = text.replace(':', '').trim();
        } else if (text && text.toLowerCase().includes('size') && !option2Name) {
            option2Name = text.replace(':', '').trim();
        }
    }
    if (!option1Name) option1Name = "Color"; // Fallback
    if (!option2Name) option2Name = "Size"; // Fallback


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

        const isColorSelected = await colorLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected') || el.getAttribute('aria-checked') === 'true');
        const isColorDisabled = await colorLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isColorSelected && !isColorDisabled) {
          console.log(`Clicking color swatch for index ${i}...`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500); // Give time for price/stock to update
        } else {
          console.log(`Color swatch for index ${i} already selected or disabled.`);
          if (isColorDisabled) continue;
        }

        // Extract the actual color value from the specific display element if available, or fallback to label text
        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(() => colorLabel.evaluate(el => el.querySelector('img')?.alt || el.ariaLabel?.replace('Color: ', '').trim() || el.textContent.trim() || 'Unknown Color'));

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

            const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected') || el.getAttribute('aria-checked') === 'true');
            const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

            if (!isSizeSelected && !isSizeDisabled) {
              console.log(`Clicking size chip for index ${j} for color "${currentOption1Value}"...`);
              await sizeLabel.click({ force: true, timeout: 10000 }); // Retaining force: true for size clicks as they are often problematic
              await page.waitForTimeout(1000);
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected or disabled.`);
              if (isSizeDisabled) continue;
            }

            // Extract the actual size value from the specific display element if available, or fallback to label text
            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                        .catch(() => sizeLabel.evaluate(el => el.textContent.trim() || 'Unknown Size'));

            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText); // compareAtPrice is no longer returned/used

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
              "Variant Compare At Price": "", // Explicitly set to empty as it's removed
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
              "Compare At Price": "", // Explicitly set to empty as it's removed
              "original_product_url": url,
            });
          }
        } else { // No size variants, only color
          console.log(`No sizes found for color "${currentOption1Value}", adding as single variant.`);
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
            "Variant Compare At Price": "",
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
            "Compare At Price": "",
            "original_product_url": url,
          });
        }
      }
    } else if (sizeChipLabels.length > 0) { // Product has only sizes (master variant)
      console.log(`🔎 Found ${sizeChipLabels.length} sizes (no colors).`);
      if (!option1Name) option1Name = "Size"; // Ensure option1Name is set if only sizes

      for (let i = 0; i < sizeChipLabels.length; i++) {
        const currentSizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeChipLabels[i];

        if (!sizeLabel) {
            console.warn(`Size label at index ${i} not found, skipping.`);
            continue;
        }

        const isSizeSelected = await sizeLabel.evaluate(el => el.querySelector('input[type="radio"]:checked') !== null || el.classList.contains('selected') || el.getAttribute('aria-checked') === 'true');
        const isSizeDisabled = await sizeLabel.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));

        if (!isSizeSelected && !isSizeDisabled) {
          console.log(`Clicking size chip for index ${i}...`);
          await sizeLabel.click({ force: true, timeout: 10000 });
          await page.waitForTimeout(1000);
        } else {
          console.log(`Size chip for index ${i} already selected or disabled.`);
          if (isSizeDisabled) continue;
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(() => sizeLabel.evaluate(el => el.textContent.trim() || 'Unknown Size'));
        console.log(`Current size selected: ${currentOption1Value}`);


        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText); // compareAtPrice no longer returned/used

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
          "Variant Compare At Price": "",
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
          "Compare At Price": "",
          "original_product_url": url,
        });
      }
    } else { // No variants (single product, no color/size options)
      console.log("🔎 No variants found for this product.");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText); // compareAtPrice no longer returned/used

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
        "Variant Compare At Price": "",
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
        "Compare At Price": "",
        "original_product_url": url,
      });
    }
    return allShopifyRows;
  } catch (error) {
    console.error(`❌ Error in extractMacyProductData for ${url}:`, error.message);
    throw error;
  }
}