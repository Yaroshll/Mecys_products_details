// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js"; // Assuming this file exists and works
import { SELECTORS } from "./constants.js";

/**
 * Safely clicks an element using Playwright's click or JavaScript click as fallback.
 * Includes scrollIntoViewIfNeeded.
 * @param {import('playwright').ElementHandle | import('playwright').Locator} element - The Playwright ElementHandle or Locator to click.
 * @param {import('playwright').Page} page - The Playwright page object (needed for waitForTimeout).
 * @param {number} [timeout=15000] - Max time to wait for the click.
 */
async function safeClick(element, page, timeout = 15000) {
  try {
    if (typeof element.scrollIntoViewIfNeeded === 'function') { // Check if it's a Locator
      await element.scrollIntoViewIfNeeded();
    } else if (typeof element.evaluate === 'function') { // Check if it's an ElementHandle
      await element.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    }
    
    await element.click({ timeout });
    await page.waitForTimeout(1000); // Give time for UI update
  } catch (error) {
    console.warn(`⚠️ Standard click failed for element, attempting JavaScript click. Error: ${error.message}`);
    try {
      if (typeof element.evaluate === 'function') {
        await element.evaluate((el) => {
          el.scrollIntoView({ block: "center", behavior: "instant" });
          el.click();
        });
      } else { // Fallback for Locator if direct evaluate is not easily available
          const elHandle = await element.elementHandle();
          if (elHandle) {
            await elHandle.evaluate((el) => {
                el.scrollIntoView({ block: "center", behavior: "instant" });
                el.click();
            });
          } else {
              throw new Error("Could not get ElementHandle for JavaScript click.");
          }
      }
      await page.waitForTimeout(1500); // Give more time for JS click
    } catch (jsError) {
      console.error(`❌ Both standard and JavaScript clicks failed for element. Error: ${jsError.message}`);
      throw jsError; // Re-throw if both fail
    }
  }
}

/**
 * Extracts the brand and product name from the title elements.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<{brand: string, productName: string, title: string}>}
 */
export async function extractTitle(page) {
  let brand = "", productName = "";
  try {
    brand = (await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND))?.trim() || "";
  } catch (e) { console.debug("Brand selector failed:", e.message); }
  try {
    productName = (await page.textContent(SELECTORS.PRODUCT.TITLE_NAME))?.trim() || "";
  } catch (e) { console.debug("Product name selector failed:", e.message); }
  
  const title = brand && productName ? `${brand}, ${productName}` : brand || productName || "";
  console.log(`Extracted Title: '${title}'`);
  return { brand, productName, title };
}

/**
 * Extracts the "cost per item" (original/strike-through price).
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The raw text of the displayed cost per item. Returns "$0.00" on failure.
 */
export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 5000 });
    const priceText = await page.textContent(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE);
    console.log(`Extracted Cost per Item (Original Price): ${priceText}`);
    return priceText?.trim() || "$0.00";
  } catch (e) {
    console.warn(`⚠️ Could not extract original/strike price: ${e.message}. Returning "$0.00".`);
    return "$0.00";
  }
}

/**
 * Extracts the main product image URL.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} The image URL or an empty string if not found.
 */
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { state: 'visible', timeout: 5000 });
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, img => img.dataset.src || img.src);
    console.log(`Extracted Main Image: ${imageUrl}`);
    return imageUrl?.trim() || "";
  } catch (e) {
    console.warn(`⚠️ Could not extract main image: ${e.message}. Returning empty string.`);
    return "";
  }
}

/**
 * Extracts breadcrumb links and formats them as a comma-separated string.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} Comma-separated breadcrumbs. Returns an empty string on failure.
 */
export async function extractBreadcrumbs(page) {
  try {
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { state: 'visible', timeout: 10000 });
    const breadcrumbs = await page.$$eval(SELECTORS.BREADCRUMBS.LINKS, anchors =>
      anchors
        .map(a => a.textContent?.trim()) // Use optional chaining for textContent
        .filter(text => text && !/home|macys/i.test(text))
        .join(", ")
    );
    console.log(`Extracted Breadcrumbs: ${breadcrumbs}`);
    return breadcrumbs;
  } catch (e) {
    console.warn(`⚠️ Could not extract breadcrumbs: ${e.message}. Returning empty string.`);
    return "";
  }
}

/**
 * Extracts the full product description.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} Combined HTML description. Returns an empty string on total failure.
 */
export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    const descButton = await page.$(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    if (descButton && await descButton.isVisible({ timeout: 2000 })) {
      console.log("Clicking description button.");
      await safeClick(descButton, page);
      await page.waitForTimeout(1000); // Give time for content to appear
    } else {
        console.log("Description button not found or not visible.");
    }

    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      fullDescriptionHtml = await page.$eval(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, el => el.innerHTML);
      console.log("Extracted full description HTML.");
    } catch (e) {
        console.warn(`⚠️ Could not extract description container HTML: ${e.message}. Attempting partial extraction.`);
        // Fallback to extract specific parts if full container fails
        let tempHtml = "";
        try {
            const mainP = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
            if (mainP) tempHtml += await mainP.evaluate(el => el.outerHTML);
        } catch (pe) { console.debug("Main paragraph extraction failed:", pe.message); }
        
        try {
            const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
            if (listItems.length > 0) {
                tempHtml += "<ul>";
                for (const item of listItems) {
                    tempHtml += await item.evaluate(el => el.outerHTML);
                }
                tempHtml += "</ul>";
            }
        } catch (le) { console.debug("List items extraction failed:", le.message); }

        try {
            const features = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
            if (features) tempHtml += await features.evaluate(el => el.outerHTML);
        } catch (fe) { console.debug("Features section extraction failed:", fe.message); }

        try {
            const shipping = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
            if (shipping) tempHtml += await shipping.evaluate(el => el.outerHTML);
        } catch (se) { console.debug("Shipping section extraction failed:", se.message); }

        fullDescriptionHtml = tempHtml;
        if (fullDescriptionHtml) console.log("Extracted description using partial selectors.");
        else console.warn("⚠️ No description content extracted.");
    }
  } catch (e) {
    console.error(`❌ Error in extractFullDescription: ${e.message}. Returning empty string.`);
  }
  return fullDescriptionHtml.trim();
}

/**
 * Extracts the label/value for a variant element.
 * Tries innerText, aria-label, img alt.
 * @param {import('playwright').ElementHandle} anchor - The element handle.
 * @returns {Promise<string>} The extracted label.
 */
async function extractLabel(anchor) {
  if (!anchor) return "";
  let label = "";
  try {
    label = (await anchor.innerText())?.trim();
    if (label) return label;
  } catch (e) {}
  try {
    label = (await anchor.getAttribute("aria-label"))?.trim();
    if (label) return label.replace(/Color:\s*|Size:\s*/i, "");
  } catch (e) {}
  try {
    label = (await anchor.$eval("img", img => img.alt || ""))?.trim();
    if (label) return label.replace(/Color:\s*|Size:\s*/i, "");
  } catch (e) {}
  return "";
}

/**
 * Get all variant anchors grouped by type (Color/Size) including their labels and selection status.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<Object.<string, Array<{anchor: import('playwright').ElementHandle, label: string, isSelected: boolean, isDisabled: boolean}>>>}
 */
async function getVariantGroups(page) {
  const groups = {};
  const variantSections = await page.$$(SELECTORS.VARIANTS.CONTAINER);

  for (const section of variantSections) {
    const titleHandle = await section.$(SELECTORS.VARIANTS.TITLE);
    const title = titleHandle ? (await titleHandle.textContent())?.trim() : "";
    if (!title) continue;

    const anchors = await section.$$(SELECTORS.VARIANTS.ITEMS);
    const details = [];

    for (const anchor of anchors) {
      const isSelected = await anchor.evaluate(el => 
        el.classList.contains('selected') || 
        el.classList.contains('color-swatch-selected') || 
        el.classList.contains('selection-tile-selected') ||
        el.getAttribute("aria-checked") === "true" ||
        el.getAttribute("aria-label")?.includes("selected")
      );
      const isDisabled = await anchor.evaluate(el => 
        el.getAttribute("aria-disabled") === "true" || 
        el.classList.contains('disabled') || 
        el.classList.contains('unavailable')
      );
      const label = await extractLabel(anchor);

      if (label && !isDisabled) { // Only add valid, non-disabled variants
        details.push({ anchor, label, isSelected, isDisabled });
      } else if (isDisabled) {
        console.log(`Skipping disabled variant: ${title}: ${label || 'N/A'}`);
      }
    }
    if (details.length > 0) {
      groups[title] = details;
    }
  }
  console.log("Detected variant groups:", Object.keys(groups).join(", "));
  return groups;
}

// -----------------------------------------------------------------------------
// MAIN EXTRACTION FUNCTION
// -----------------------------------------------------------------------------

export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];

  // 1. Navigate to the page with retries and a longer timeout for the initial load.
  console.log(`Navigating to URL: ${url}`);
  try {
    await gotoMacyWithRetries(page, url);
    await page.waitForLoadState("networkidle", { timeout: 60000 }); // Increased to 60 seconds
    await page.waitForTimeout(5000); // Additional wait for scripts to execute
    console.log("Page loaded to networkidle state.");
  } catch (navigationError) {
    console.error(`❌ Initial page navigation or load state failed: ${navigationError.message}`);
    return []; 
  }

  // 2. Inject CSS more aggressively to hide overlays.
  try {
    console.log("Injecting CSS to hide overlays...");
    await page.addStyleTag({
      content: `
        /* General hidden elements and modals */
        .modal-overlay, .modal-dialog, #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
        .loyalty-banner, .toast-notification, .cookie-banner, .interstitial-modal, .marketing-modal-wrapper,
        .full-width-overlay, .overlay-backdrop, .atc-flyout, .x-modal-backdrop, ._modal-content, ._modal-overlay,
        /* Specific Macy's elements that might cover content or prevent interaction */
        .fofo-overlay, ._overlay, ._dialog, .overlay.active, .is-active.f-modal__backdrop,
        .overlay-layer, .marketing-popup-container, .modal.fade.in, .modal-open .modal,
        .email-capture-overlay, .email-signup-modal, .global-site-message,
        
        /* Elements that might stick at top/bottom and interfere with scrolling/visibility */
        #global-header, .slideout-header, .sticky-bottom-bar,
        .enhanced-offer-banner, .footer-container, [data-auto="added-to-bag-modal"],
        .product-callouts-container { /* This might be useful if it covers things */
          visibility: hidden !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
          opacity: 0 !important;
          display: none !important;
        }
        body.modal-open, html.no-scroll, body.noscroll { overflow: auto !important; }
        /* Ensure primary content is visible */
        #main-content, .main-wrapper, .product-main-content {
            visibility: visible !important;
            pointer-events: auto !important;
            height: auto !important;
            width: auto !important;
            overflow: visible !important;
            opacity: 1 !important;
            display: block !important;
        }
      `
    });
    await page.waitForTimeout(2000); // Give time for styles to apply
    console.log("CSS injected successfully.");
  } catch (styleError) {
    console.warn("⚠️ Could not apply style tag to hide elements:", styleError.message);
  }

  // 3. Wait for a crucial element to ensure the product page content is present.
  try {
    console.log("Waiting for product title selector to be visible...");
    await page.waitForSelector(SELECTORS.PRODUCT.TITLE_NAME, { state: 'visible', timeout: 30000 }); // Wait up to 30 seconds for the title
    console.log("Product title found.");
  } catch (selectorError) {
    console.error(`❌ Product title selector not found within timeout: ${selectorError.message}`);
    console.log("⚠️ No product data to save due to missing key elements after load.");
    return []; // Exit if the core product title isn't there
  }

  const { title } = await extractTitle(page);
  const descriptionHtml = await extractFullDescription(page);
  const breadcrumbs = await extractBreadcrumbs(page);
  const handle = formatHandleFromUrl(url);

  const finalProductTags = [...new Set([
    ...breadcrumbs.split(",").map(t => t.trim()).filter(Boolean),
    ...(extraTags ? extraTags.split(",").map(t => t.trim()).filter(Boolean) : [])
  ])].join(", ");

  // Fetch initial variant groups
  let initialVariantGroups = await getVariantGroups(page);
  const colors = initialVariantGroups["Color"] || [];
  const sizes = initialVariantGroups["Size"] || [];

  const commonShopifyRow = {
    "Handle": handle,
    "Title": title, // Only for first row
    "Body (HTML)": descriptionHtml, // Only for first row
    "Vendor": "Macy's",
    "Type": "Footwear",
    "Tags": finalProductTags, // Only for first row
    "Published": "TRUE",
    "Option1 Name": "",
    "Option1 Value": "",
    "Option2 Name": "",
    "Option2 Value": "",
    "Option3 Name": "",
    "Option3 Value": "",
    "Variant SKU": extractSKU(url), // SKU per variant
    "Variant Grams": "",
    "Variant Price": "", // Price per variant
    "Variant Compare At Price": "", // Compare at price per variant
    "Variant Cost": "", // Cost per item per variant
    "Variant Taxable": "TRUE",
    "Variant Barcode": "",
    "Image Src": "", // Main image for first row only
    "Image Position": 1,
    "Image Alt Text": "", // Alt text per variant
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
    "Variant Image": "", // Image for this specific variant
    "Variant Weight Unit": "oz",
    "Variant Tax Code": "",
    "Cost per item": "", // Redundant, but keeping for compatibility if needed
    "Price": "", // Redundant, but keeping for compatibility if needed
    "Compare At Price": "", // Redundant, but keeping for compatibility if needed
    "original_product_url": url, // Only for first row
  };

  let isFirstRow = true; // Flag to control unique fields for the first row

  if (colors.length > 0) {
    // Determine if there's a color already selected to start with it
    const initialSelectedColor = colors.find(c => c.isSelected);
    const orderedColors = initialSelectedColor
        ? [initialSelectedColor, ...colors.filter(c => !c.isSelected)]
        : colors; // Put selected first, or use original order

    for (const colorVariant of orderedColors) {
      if (colorVariant.isDisabled) {
        console.log(`Skipping disabled color: ${colorVariant.label}`);
        continue;
      }

      console.log(`Processing Color: ${colorVariant.label}`);
      // Click the color if it's not already selected
      if (!colorVariant.isSelected) {
        await safeClick(colorVariant.anchor, page);
        await page.waitForTimeout(2000); // Wait for color change to apply and prices/sizes to update
      } else {
        console.log(`Color '${colorVariant.label}' already selected.`);
        await page.waitForTimeout(1000); // Small wait even if selected
      }

      // Re-fetch sizes *after* selecting a color, as available sizes can change
      let currentVariantGroups = await getVariantGroups(page);
      const currentSizes = currentVariantGroups["Size"] || [];
      const currentMainImage = await extractMainImage(page); // Get image after color change

      if (currentSizes.length > 0) {
        for (const sizeVariant of currentSizes) {
          if (sizeVariant.isDisabled) {
            console.log(`Skipping disabled size: ${sizeVariant.label} for color ${colorVariant.label}`);
            continue;
          }
          console.log(`Processing Size: ${sizeVariant.label} for Color: ${colorVariant.label}`);
          await safeClick(sizeVariant.anchor, page);
          await page.waitForTimeout(1000); // Wait for price/stock update

          const priceText = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

          const row = { ...commonShopifyRow };
          row["Title"] = isFirstRow ? commonShopifyRow["Title"] : "";
          row["Body (HTML)"] = isFirstRow ? commonShopifyRow["Body (HTML)"] : "";
          row["Tags"] = isFirstRow ? commonShopifyRow["Tags"] : "";
          row["Image Src"] = isFirstRow ? currentMainImage : "";
          row["original_product_url"] = isFirstRow ? commonShopifyRow["original_product_url"] : "";
          isFirstRow = false; // Set to false after the first row

          row["Option1 Name"] = "Color";
          row["Option1 Value"] = colorVariant.label;
          row["Option2 Name"] = "Size";
          row["Option2 Value"] = sizeVariant.label;
          row["Variant Price"] = variantPrice;
          row["Variant Compare At Price"] = compareAtPrice;
          row["Variant Cost"] = costPerItem;
          row["Cost per item"] = costPerItem; // Redundant
          row["Price"] = variantPrice; // Redundant
          row["Compare At Price"] = compareAtPrice; // Redundant
          row["Variant Image"] = currentMainImage;
          row["Image Alt Text"] = `${title} - ${colorVariant.label} ${sizeVariant.label}`;

          allShopifyRows.push(row);
        }
      } else {
        // Case: Color has no associated sizes
        console.log(`No sizes found for Color: ${colorVariant.label}. Adding as a single color variant.`);
        const priceText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

        const row = { ...commonShopifyRow };
        row["Title"] = isFirstRow ? commonShopifyRow["Title"] : "";
        row["Body (HTML)"] = isFirstRow ? commonShopifyRow["Body (HTML)"] : "";
        row["Tags"] = isFirstRow ? commonShopifyRow["Tags"] : "";
        row["Image Src"] = isFirstRow ? currentMainImage : "";
        row["original_product_url"] = isFirstRow ? commonShopifyRow["original_product_url"] : "";
        isFirstRow = false;

        row["Option1 Name"] = "Color";
        row["Option1 Value"] = colorVariant.label;
        row["Option2 Name"] = ""; // No size option
        row["Option2 Value"] = "";
        row["Variant Price"] = variantPrice;
        row["Variant Compare At Price"] = compareAtPrice;
        row["Variant Cost"] = costPerItem;
        row["Cost per item"] = costPerItem;
        row["Price"] = variantPrice;
        row["Compare At Price"] = compareAtPrice;
        row["Variant Image"] = currentMainImage;
        row["Image Alt Text"] = `${title} - ${colorVariant.label}`;

        allShopifyRows.push(row);
      }
    }
  } else if (sizes.length > 0) {
    // Case: Product has only sizes, no colors
    const initialSelectedSize = sizes.find(s => s.isSelected);
    const orderedSizes = initialSelectedSize
        ? [initialSelectedSize, ...sizes.filter(s => !s.isSelected)]
        : sizes;

    for (const sizeVariant of orderedSizes) {
      if (sizeVariant.isDisabled) {
        console.log(`Skipping disabled size: ${sizeVariant.label}`);
        continue;
      }
      console.log(`Processing Size: ${sizeVariant.label}`);
      if (!sizeVariant.isSelected) {
        await safeClick(sizeVariant.anchor, page);
        await page.waitForTimeout(1000);
      } else {
        console.log(`Size '${sizeVariant.label}' already selected.`);
        await page.waitForTimeout(500);
      }

      const currentMainImage = await extractMainImage(page);
      const priceText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

      const row = { ...commonShopifyRow };
      row["Title"] = isFirstRow ? commonShopifyRow["Title"] : "";
      row["Body (HTML)"] = isFirstRow ? commonShopifyRow["Body (HTML)"] : "";
      row["Tags"] = isFirstRow ? commonShopifyRow["Tags"] : "";
      row["Image Src"] = isFirstRow ? currentMainImage : "";
      row["original_product_url"] = isFirstRow ? commonShopifyRow["original_product_url"] : "";
      isFirstRow = false;

      row["Option1 Name"] = "Size";
      row["Option1 Value"] = sizeVariant.label;
      row["Option2 Name"] = "";
      row["Option2 Value"] = "";
      row["Variant Price"] = variantPrice;
      row["Variant Compare At Price"] = compareAtPrice;
      row["Variant Cost"] = costPerItem;
      row["Cost per item"] = costPerItem;
      row["Price"] = variantPrice;
      row["Compare At Price"] = compareAtPrice;
      row["Variant Image"] = currentMainImage;
      row["Image Alt Text"] = `${title} - ${sizeVariant.label}`;

      allShopifyRows.push(row);
    }
  } else {
    // Case: No variants (single product)
    console.log("--- No variants found. Processing as a single product. ---");
    const currentMainImage = await extractMainImage(page);
    const priceText = await extractDisplayedCostPerItem(page);
    const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

    const row = { ...commonShopifyRow };
    row["Title"] = isFirstRow ? commonShopifyRow["Title"] : "";
    row["Body (HTML)"] = isFirstRow ? commonShopifyRow["Body (HTML)"] : "";
    row["Tags"] = isFirstRow ? commonShopifyRow["Tags"] : "";
    row["Image Src"] = isFirstRow ? currentMainImage : "";
    row["original_product_url"] = isFirstRow ? commonShopifyRow["original_product_url"] : "";
    isFirstRow = false;

    row["Variant Price"] = variantPrice;
    row["Variant Compare At Price"] = compareAtPrice;
    row["Variant Cost"] = costPerItem;
    row["Cost per item"] = costPerItem;
    row["Price"] = variantPrice;
    row["Compare At Price"] = compareAtPrice;
    row["Variant Image"] = currentMainImage;
    row["Image Alt Text"] = title; // No variant specific alt text needed

    allShopifyRows.push(row);
  }

  console.log(`✅ Finished extracting data for ${allShopifyRows.length} Shopify rows.`);
  return allShopifyRows;
}