// helpers/extractors.js
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js';

// --- NEW: Helper function for URL formatting ---
export function formatHandleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathnameParts = urlObj.pathname.split('/').filter(Boolean); // Split by / and remove empty strings
    // Take the last part of the pathname (e.g., "jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals")
    let handle = pathnameParts[pathnameParts.length - 1];

    // Remove common URL parameters that might be appended after the main path
    handle = handle.split('?')[0].split('#')[0];

    // Replace non-alphanumeric characters (except hyphens) with hyphens,
    // convert to lowercase, and trim extra hyphens.
    handle = handle.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    handle = handle.replace(/--+/g, '-').replace(/^-|-$/g, ''); // Replace multiple hyphens with single, remove leading/trailing hyphens

    return handle;
  } catch (e) {
    console.warn(`⚠️ Could not format handle from URL ${url}: ${e.message}`);
    return null; // Return null or a default if URL is invalid
  }
}
// --- END NEW ---

// Helper function for navigation with retries
export async function gotoMacyWithRetries(page, url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 }); // Increased timeout for goto
      return; // If successful, exit
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed to navigate to ${url}: ${error.message}`);
      if (i === maxRetries - 1) throw error; // Re-throw if all retries fail
      await page.waitForTimeout(2000); // Wait before retrying
    }
  }
}

// Helper function to extract SKU from URL (example for Macy's)
export function extractSKU(url) {
  const match = url.match(/ID=(\d+)/);
  return match ? `MACY-${match[1]}` : null;
}

// Helper function to calculate prices based on original cost and rate
export function calculatePrices(costPerItemText) {
  const costMatch = costPerItemText.match(/\$?([0-9,]+\.?[0-9]*)/);
  let costPerItem = costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0;

  let variantPrice = parseFloat((costPerItem * VARIANT_PRICE_RATE).toFixed(2));
  let compareAtPrice = parseFloat((costPerItem * (VARIANT_PRICE_RATE * 1.2)).toFixed(2)); // Example: 20% higher than variantPrice

  return { costPerItem, variantPrice, compareAtPrice };
}

// Helper function to extract the full title
export async function extractTitle(page) {
  const brand = await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND).catch(() => null);
  const productName = await page.textContent(SELECTORS.PRODUCT.TITLE_NAME).catch(() => null);
  const title = `${brand || ''} ${productName || ''}`.trim();
  return { brand, productName, title };
}

// Helper function to extract the main image URL
export async function extractMainImage(page) {
  const mainImageElement = await page.$(SELECTORS.PRODUCT.MAIN_IMAGE);
  if (mainImageElement) {
    const src = await mainImageElement.getAttribute('src');
    const dataSrc = await mainImageElement.getAttribute('data-src');
    return dataSrc || src; // Prefer data-src if available
  }
  return null;
}

// Helper function to extract description
export async function extractFullDescription(page) {
  let descriptionHtml = '';
  try {
    // Click the "Description & Features" button if it exists
    const descriptionButton = await page.$(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    if (descriptionButton) {
      await descriptionButton.click();
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500); // Short delay for content to render after expanding
    }

    // Extract main paragraph
    const mainParagraph = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
    if (mainParagraph) {
      descriptionHtml += await mainParagraph.innerHTML();
    }

    // Extract list items (features)
    const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
    if (listItems.length > 0) {
      descriptionHtml += '<ul>';
      for (const item of listItems) {
        descriptionHtml += `<li>${await item.innerHTML()}</li>`;
      }
      descriptionHtml += '</ul>';
    }

    // Fallback: If specific elements not found, try to get general description area content
    if (!descriptionHtml) {
        const fallbackDescContainer = await page.$('div.details-accordion-body'); // Common alternative
        if (fallbackDescContainer) {
            descriptionHtml = await fallbackDescContainer.innerHTML();
        }
    }

  } catch (error) {
    console.warn(`⚠️ Could not extract full description: ${error.message}`);
  }
  return descriptionHtml.trim();
}

// Helper to extract breadcrumbs
export async function extractBreadcrumbs(page) {
  const breadcrumbLinks = await page.$$(SELECTORS.BREADCRUMBS.LINKS);
  const breadcrumbs = [];
  for (const link of breadcrumbLinks) {
    // Extract text, remove any SVG elements (common for separators)
    const text = await link.evaluate(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('svg').forEach(svg => svg.remove());
      return clone.textContent.trim();
    });
    if (text) {
      breadcrumbs.push(text);
    }
  }
  return breadcrumbs.join(' > ');
}

// Helper to extract current price text
export async function extractDisplayedCostPerItem(page) {
  let priceText = null;
  try {
    // Prioritize current/sale price
    const currentPriceElement = await page.$(SELECTORS.PRODUCT.CURRENT_PRICE);
    if (currentPriceElement) {
      priceText = await currentPriceElement.textContent();
    } else {
      // Fallback to original/strike price if current not found (though less ideal for 'current' cost)
      const originalPriceElement = await page.$(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE);
      if (originalPriceElement) {
        priceText = await originalPriceElement.textContent();
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not extract price: ${error.message}`);
  }
  return priceText ? priceText.trim() : "$0.00"; // Return a default if no price found
}


// Helper function to wait for image to change after clicking a variant
// (This is a simplified version; for robust image change detection,
// you might need to compare src attributes before/after a delay)
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  // Get current main image src
  const initialImageSrc = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, el => el.getAttribute('src') || el.getAttribute('data-src')).catch(() => null);

  // Click the anchor
  await anchorToClick.click({ timeout: 10000 }); // Added timeout to click
  await page.waitForTimeout(1000); // Wait for potential network/render update

  // You can add more sophisticated image change detection here if needed,
  // e.g., loop and check if src changed, or wait for specific network requests.
  // For now, a simple wait after click is often sufficient.
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
    // Increased initial wait time after load state for heavy JS sites
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000); // Increased from 3000ms

    // --- NEW: Try to hide common intercepting elements before starting variant clicks ---
    try {
      console.log("Attempting to hide potential intercepting elements...");
      await page.addStyleTag({
        content: `
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar, #teleported, /* common Macy's overlays/fixed elements */
          .modal-overlay, .modal-dialog, /* generic popup/modal selectors */
          .loyalty-banner, .toast-notification, /* other banners/notifications if they appear */
          /* Macy's specific elements that often overlay or interact */
          #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .enhanced-offer-banner, .interstitial-modal, .cookie-banner, .footer-container
          {
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            overflow: hidden !important;
            opacity: 0 !important; /* Ensure no visual presence */
            display: none !important; /* Strongest hide option */
          }
        `
      });
      console.log("Potential intercepting elements hidden.");
    } catch (styleError) {
      console.warn("⚠️ Could not apply style to hide elements:", styleError.message);
    }
    // --- END NEW ---


    const handle = formatHandleFromUrl(url); // Now `formatHandleFromUrl` is defined
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

    // Get option names. Macy's usually shows these above the swatches.
    // Added more robust selectors for option names
    const optionNameElements = await page.$$('legend.form-label, span.updated-label.label, [data-auto="color-picker-label"], [data-auto="size-picker-label"]');
    for (const el of optionNameElements) {
        const text = await el.textContent();
        if (text && text.includes('Color') && !option1Name) {
            option1Name = text.replace(':', '').trim();
        } else if (text && text.includes('Size') && !option2Name) {
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
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500); // Give time for price/stock/size options to update
        } else {
          console.log(`Color swatch for index ${i} already selected or disabled.`);
          if (isColorDisabled) continue;
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                                    .catch(async () => {
                                        // Fallback if the specific display element isn't immediately available
                                        const altText = await colorLabel.$eval('img', img => img.alt).catch(() => '');
                                        if (altText) return altText;
                                        return colorLabel.textContent().catch(() => 'Unknown Color');
                                    });
        console.log(`Current color selected: ${currentOption1Value}`);


        const mainImage = await extractMainImage(page);

        // Re-fetch size labels *after* color change as they often depend on color selection
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
              await sizeLabel.click({ timeout: 10000 }); // Retrying click with default timeout increased
              await page.waitForTimeout(1000); // Small delay for price/stock to update
            } else {
              console.log(`Size chip for index ${j} for color "${currentOption1Value}" already selected or disabled.`);
              if (isSizeDisabled) continue;
            }

            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                        .catch(async () => {
                                            // Fallback if the specific display element isn't immediately available
                                            return sizeLabel.textContent().catch(() => 'Unknown Size');
                                        });
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