// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from './constants.js'; // Ensure constants.js is correctly defined

/**
 * Safely clicks an element, attempting a forced click first, then a JavaScript click if needed.
 * Logs warnings for failures but attempts to recover.
 * @param {import('playwright').Locator | import('playwright').ElementHandle} element - The Playwright Locator or ElementHandle to click.
 * @param {number} [timeout=10000] - Maximum time to wait for the click to complete.
 */
async function safeClick(element, timeout = 10000) {
  try {
    await element.click({ force: true, timeout });
  } catch (error) {
    console.warn(`⚠️ Standard click failed for element, attempting JavaScript click. Error: ${error.message}`);
    try {
      await element.evaluate(el => el.click());
    } catch (jsClickError) {
      console.error(`❌ Both standard and JavaScript clicks failed for element. Error: ${jsClickError.message}`);
      throw jsClickError;
    }
  }
}

/**
 * Extracts the brand and product name from the title elements and formats them.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<{brand: string, productName: string, title: string}>}
 */
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";

  try {
    brand = (await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND))?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = (await page.textContent(SELECTORS.PRODUCT.TITLE_NAME))?.trim() || "";
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }

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
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { state: 'visible', timeout: 3000 });
    costText = await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
    console.log(`Extracted original/strike price: ${costText}`);
    return costText;
  } catch (error) {
    console.warn("⚠️ Could not extract original/strike price, trying current price:", error.message);
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { state: 'visible', timeout: 3000 });
      costText = await page.$eval(SELECTORS.PRODUCT.CURRENT_PRICE, el => el.textContent.trim());
      console.log(`ℹ️ Falling back to current price: ${costText}`);
      return costText;
    } catch (currentPriceError) {
      console.warn("⚠️ Could not extract any price, defaulting to '$0.00':", currentPriceError.message);
      return "$0.00";
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
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, el => el.dataset.src || el.src || '');
    return imageUrl;
  } catch (error) {
    console.warn("⚠️ Could not extract main image:", error.message);
    return "";
  }
}

/**
 * Extracts breadcrumb links and formats them as a " > " separated string.
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
            tempDiv.querySelectorAll('svg, .separator-icon, .breadcrumb-icon, [data-auto="icon"]').forEach(el => el.remove());
            let text = tempDiv.textContent.trim();
            if (text && text.toLowerCase() !== 'home') {
              return text;
            }
            return null;
          })
          .filter(Boolean)
          .join(" > ");
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
 * Extracts the full product description.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @returns {Promise<string>} Combined HTML description. Returns an empty string on total failure.
 */
export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    const descriptionButton = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first();
    if (descriptionButton && await descriptionButton.isVisible({ timeout: 3000 })) {
      console.log("Clicking description/details button to expand content...");
      await safeClick(descriptionButton);
      await page.waitForTimeout(1000);
    } else {
        console.log("Description button not found or not visible, proceeding without clicking.");
    }

    try {
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

    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 3000 });
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        const itemsToExtract = listItems.slice(0, listItems.length - 1); // Exclude last if it's a link
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
 * @param {object} options - Options object.
 * @param {import('playwright').Page} options.page - The Playwright page object.
 * @param {import('playwright').ElementHandle | import('playwright').Locator} options.anchorToClick - The element to click.
 */
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page);
  
  if (anchorToClick) {
    // Ensure element is in view before clicking
    if (typeof anchorToClick.evaluate === 'function') { // Check if it's an ElementHandle
      await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    } else { // Assume it's a Locator
      await anchorToClick.scrollIntoViewIfNeeded();
    }
  }

  await safeClick(anchorToClick);
  console.log("Waiting for image change or variant data update...");
  
  try {
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currImageElement = document.querySelector(selector);
        const currMainImageSrc = currImageElement?.src;
        const currMainImageDataSrc = currImageElement?.dataset.src;
        return (currMainImageSrc && currMainImageSrc !== prevMainImage) || (currMainImageDataSrc && currMainImageDataSrc !== prevMainImage);
      },
      oldMainImage,
      SELECTORS.PRODUCT.MAIN_IMAGE,
      { timeout: 10000 }
    );
    console.log("✅ Main image updated successfully after variant selection.");
  } catch (err) {
    console.warn("⚠️ Main image did not change or timed out after variant click. This might be expected if only price/stock updates, or could indicate an issue:", err.message);
  }
  await page.waitForTimeout(2000);
}

/**
 * Extracts the label/value for a variant element.
 * Tries innerText, aria-label, img alt, or data-value.
 * @param {object} options - Options object.
 * @param {import('playwright').ElementHandle} options.anchor - The element handle.
 * @returns {Promise<string>} The extracted label.
 */
async function extractLabel({ anchor }) {
  if (!anchor) return "";
  let label = "";
  try {
    // Try innerText first, as it's often the most direct visible label
    label = (await anchor.innerText()).trim();
    if (label) return label;
  } catch (e) {
    // Fallback to aria-label
    label = (await anchor.getAttribute("aria-label"))?.trim();
    if (label) return label.replace(/Color:\s*|Size:\s*/i, ""); // Clean "Color: " or "Size: "
  }
  try {
    // Fallback to img alt if it's an image-based swatch
    label = (await anchor.$eval("img", (img) => img.alt || "")).trim();
    if (label) return label.replace(/Color:\s*|Size:\s*/i, "");
  } catch (e) {
    // Last resort: data-value attribute
    label = (await anchor.getAttribute("data-value"))?.trim();
    if (label) return label;
  }
  return "";
}

/**
 * Collects all variant anchors (e.g., Color, Size, Size Group) and their properties.
 * @param {object} options - Options object.
 * @param {import('playwright').Page} options.page - The Playwright page object.
 * @returns {Promise<Object.<string, {items: Array<{anchor: import('playwright').ElementHandle, isSelected: boolean}>, order: number}>>}
 */
export async function handleCollectVariants({ page }) {
  // Use a more specific selector for the variant sections to avoid capturing unrelated divs
  await page.waitForSelector(SELECTORS.VARIANTS.CONTAINER, { state: 'visible', timeout: 15000 });
  const variantSections = await page.$$(SELECTORS.VARIANTS.CONTAINER);
  
  const anchorsPerVariant = {};
  let variantOrder = 1;

  for (const section of variantSections) {
    const variantTitleHandle = await section.$(SELECTORS.VARIANTS.TITLE);
    let variantTitle = "";
    if (variantTitleHandle) {
      variantTitle = (await variantTitleHandle.innerText()).trim();
    } else {
        // If no explicit title, try to infer from common selectors or skip
        console.warn("⚠️ Could not find variant title for a section. Skipping or inferring.");
        continue;
    }

    // Use a more generic selector for variant items/swatches within each section
    const anchors = await section.$$(SELECTORS.VARIANTS.ITEMS);
    const anchorsDetails = [];

    for (const anchor of anchors) {
      const isSelected = await anchor.evaluate((el) => {
        // Check for common selection indicators
        return el.classList.contains('selected') || 
               el.classList.contains('color-swatch-selected') || 
               el.classList.contains('selection-tile-selected') ||
               el.getAttribute("aria-checked") === "true" ||
               el.getAttribute("aria-label")?.includes("selected");
      });
      const isDisabled = await anchor.evaluate((el) => {
        return el.getAttribute("aria-disabled") === "true" || 
               el.classList.contains('disabled') || 
               el.classList.contains('unavailable');
      });

      if (!isDisabled) { // Only add non-disabled variants
          anchorsDetails.push({ anchor, isSelected });
      } else {
          const disabledLabel = await extractLabel({ anchor });
          console.log(`Skipping disabled variant: ${variantTitle}: ${disabledLabel}`);
      }
    }

    if (variantTitle) {
      anchorsPerVariant[variantTitle] = {
        items: anchorsDetails,
        order: variantOrder,
      };
      variantOrder++;
    }
  }
  return anchorsPerVariant;
}

/**
 * Selects the correct Size Group if present.
 * @param {object} options - Options object.
 * @param {Array<object>} options.sizeGroupAnchors - Array of Size Group variant items.
 * @param {import('playwright').Page} options.page - The Playwright page object.
 */
async function selectCorrectSizeGroup({ page, sizeGroupAnchors }) {
    if (!sizeGroupAnchors || sizeGroupAnchors.length === 0) {
        console.log("No 'Size Group' variants found or provided.");
        return;
    }

    // Logic to select the "correct" size group.
    // For now, let's just click the first available one if none is selected.
    // You might need to refine this based on specific Macy's logic (e.g., "Standard", "Plus", "Petite")
    let selectedGroup = sizeGroupAnchors.find(sg => sg.isSelected);
    if (!selectedGroup) {
        // If no group is selected, click the first one that's not disabled.
        const firstClickableGroup = sizeGroupAnchors.find(sg => sg.anchor); // Check if anchor exists (not disabled implicitly)
        if (firstClickableGroup) {
            console.log(`Clicking first available Size Group.`);
            await safeClick(firstClickableGroup.anchor);
            await page.waitForTimeout(1000); // Wait for sizes to re-render
        } else {
            console.warn("No clickable Size Group found.");
        }
    } else {
        const label = await extractLabel({ anchor: selectedGroup.anchor });
        console.log(`'Size Group' variant already selected: ${label}.`);
    }
    await page.waitForLoadState('networkidle'); // Wait for any new content to load
    await page.waitForTimeout(1000);
}

/**
 * Waits for the URL to change. Useful after certain clicks that trigger navigation.
 * @param {object} options - Options object.
 * @param {import('playwright').Page} options.page - The Playwright page object.
 * @param {number} [timeout=10000] - Max time to wait.
 */
async function waitForUrlChange({ page, timeout = 10000 }) {
  const initialUrl = page.url();
  try {
    await page.waitForURL((url) => url.href !== initialUrl, { timeout });
    console.log(`✅ URL changed from ${initialUrl} to ${page.url()}`);
  } catch (error) {
    console.warn(`⚠️ URL did not change within ${timeout}ms. It might be an in-page update. Error: ${error.message}`);
  }
  await page.waitForTimeout(500); // Small buffer
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} str - The input string.
 * @returns {string} The capitalized string.
 */
function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// -----------------------------------------------------------------------------
// MAIN EXTRACTION FUNCTION
// -----------------------------------------------------------------------------

/**
 * Extracts all product data from a Macy's product page, handling variants.
 * @param {import('playwright').Page} page - The Playwright page object.
 * @param {string} url - The URL of the product to scrape.
 * @param {string} extraTags - Comma-separated string of additional tags.
 * @returns {Promise<Array<object>>} An array of Shopify-formatted product row objects.
 */
export async function extractMacyProductData(page, url, extraTags) {
  try {
    await gotoMacyWithRetries(page, url);
    console.info("✅ Page navigated successfully. Waiting for full page load and stability...");
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    // Inject CSS to hide overlays
    try {
      await page.addStyleTag({
        content: `
          .modal-overlay, .modal-dialog, #modal-root, [role="dialog"], .ReactModal__Overlay, .ReactModal__Content,
          .loyalty-banner, .toast-notification, .cookie-banner, .interstitial-modal, .marketing-modal-wrapper,
          .full-width-overlay, .overlay-backdrop, .atc-flyout,
          #global-header, .slideout-header, [data-auto="product-details-section-shipping"], .sticky-bottom-bar,
          .enhanced-offer-banner, .footer-container, [data-auto="added-to-bag-modal"] {
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
            opacity: 0 !important;
            display: none !important;
          }
          body.modal-open, html.no-scroll { overflow: auto !important; }
        `
      });
      console.log("✅ CSS injected to hide potential intercepting elements.");
      await page.waitForTimeout(1000);
    } catch (styleError) {
      console.warn("⚠️ Could not apply style tag to hide elements, proceeding anyway:", styleError.message);
    }

    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    // Combine and unique product tags
    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(" > ").map(tag => tag.trim()).filter(Boolean), // Use " > " split here
        ...(extraTags ? extraTags.split(",").map(tag => tag.trim()).filter(Boolean) : []),
      ]),
    ].join(", ");

    // 2. Collect variants and handle Size Group if present
    // This will initially collect all variant options including their titles (e.g., "Color", "Size", "Size Group")
    let anchorsPerVariant = await handleCollectVariants({ page });
    
    // Attempt to select the "Size Group" if it exists and needs an initial click
    await selectCorrectSizeGroup({
        page,
        sizeGroupAnchors: anchorsPerVariant["Size Group"]?.items, // Pass the actual items array
    });
    
    // IMPORTANT: Re-collect variants after selecting Size Group, as available sizes might change
    anchorsPerVariant = await handleCollectVariants({ page });


    // 3. Detect actual master/slave variant keys (ignore "Size Group")
    const variantKeysOrdered = Object.entries(anchorsPerVariant)
      .filter(([key]) => key !== "Size Group")
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key]) => key);

    const masterKey = variantKeysOrdered[0]; // e.g. "Color" or "Size"
    const slaveKey = variantKeysOrdered[1]; // e.g. "Size" or undefined

    const allVariantsData = []; // Renamed from allVariants to avoid confusion with the old structure

    // 4. Handle NO variant case
    if (!masterKey) {
      // No variants: just one default product row
      console.log("--- No variants (colors or sizes) found for this product. Processing as a single product. ---");
      const mainImage = await extractMainImage(page);
      const sku = extractSKU(url);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { variantPrice, compareAtPrice, costPerItem } = calculatePrices(
        displayedCostPerItemText,
      ); // Only one price for single product

      allVariantsData.push({
        sku,
        variantPrice,
        compareAtPrice,
        costPerItem,
        mainImage,
        option1: "", // Explicitly empty for single product
        option2: "", // Explicitly empty for single product
      });
    } else {
      // 5. Master loop
      // We need to re-collect master variants within the loop to get fresh ElementHandles
      // because DOM elements might become stale after clicks.
      const initialMasterVariants = anchorsPerVariant[masterKey]?.items ?? [];

      for (let i = 0; i < initialMasterVariants.length; i++) {
        // Re-collect all variants to get fresh ElementHandles for the current iteration
        // This is crucial for navigating dynamic pages.
        let currentAnchorsPerVariant = await handleCollectVariants({ page });
        const masterVariant = currentAnchorsPerVariant[masterKey]?.items[i];
        
        if (!masterVariant || !masterVariant.anchor) {
            console.warn(`Could not find master variant element at index ${i} for key '${masterKey}'. Skipping.`);
            continue;
        }

        // Click master variant if not selected
        if (!masterVariant.isSelected) {
          console.log(`Clicking master variant: '${await extractLabel({ anchor: masterVariant.anchor })}' for key '${masterKey}'`);
          if (masterKey.toLowerCase() === "color") {
            await waitForImageChangeCheck({
              anchorToClick: masterVariant.anchor,
              page,
            });
          } else {
            await safeClick(masterVariant.anchor);
            await waitForUrlChange({ page }); // Wait for URL change if it's a non-color variant (e.g., general "Type")
            await page.waitForTimeout(1000); // Add a small delay for page to settle
          }
        } else {
            console.log(`Master variant '${await extractLabel({ anchor: masterVariant.anchor })}' is already selected.`);
        }

        // Always re-collect variants after a master change to get updated slave options
        currentAnchorsPerVariant = await handleCollectVariants({ page });

        // Fetch master label and main image (after color change)
        // Ensure to get the label from the *currently selected* master variant if possible, or from the clicked one
        const currentMasterLabel = await extractLabel({ anchor: masterVariant.anchor });
        let mainImage = await extractMainImage(page);

        // 6. Slave loop, if present
        if (slaveKey && currentAnchorsPerVariant[slaveKey]?.items?.length > 0) {
          console.log(`--- Processing slave variants (${slaveKey}) for master: '${currentMasterLabel}' ---`);
          const slaveVariantsForCurrentMaster = currentAnchorsPerVariant[slaveKey].items;

          for (let j = 0; j < slaveVariantsForCurrentMaster.length; j++) {
            const slaveVariant = slaveVariantsForCurrentMaster[j];
            
            if (!slaveVariant || !slaveVariant.anchor) {
                console.warn(`Could not find slave variant element at index ${j} for key '${slaveKey}'. Skipping.`);
                continue;
            }

            // Scroll container for first slave variant to avoid out-of-view click
            if (j === 0 && slaveVariant.anchor) {
              await slaveVariant.anchor.evaluate((el) => {
                if (el?.parentElement?.parentElement?.scrollTo) {
                  el.parentElement.parentElement.scrollTo(0, 0);
                }
              });
              await page.waitForTimeout(100);
            }

            console.log(`Clicking slave variant: '${await extractLabel({ anchor: slaveVariant.anchor })}' for key '${slaveKey}'`);
            if (slaveKey.toLowerCase() === "color") {
              try {
                await waitForImageChangeCheck({
                  anchorToClick: slaveVariant.anchor,
                  page,
                });
              } catch (err) {
                console.warn(`Error during slave color change image check: ${err.message}. Waiting and proceeding.`);
                await page.waitForTimeout(1000);
              }
              mainImage = await extractMainImage(page); // Update main image if color changed
            } else {
              await safeClick(slaveVariant.anchor);
              await waitForUrlChange({ page }); // Wait for URL change if applicable
              await page.waitForTimeout(1000); // Add a small delay
            }

            // Fetch slave label after clicking
            const currentSlaveLabel = await extractLabel({ anchor: slaveVariant.anchor });

            const sku = extractSKU(page.url());
            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { variantPrice, compareAtPrice, costPerItem } =
              calculatePrices(displayedCostPerItemText);

            allVariantsData.push({
              [masterKey.toLowerCase()]: currentMasterLabel,
              [slaveKey.toLowerCase()]: currentSlaveLabel,
              sku,
              variantPrice,
              compareAtPrice,
              costPerItem,
              mainImage,
            });
          }
        } else {
          // No slave, just push master variant
          console.log(`No slave variants found for master: '${currentMasterLabel}'. Adding master variant only.`);
          const sku = extractSKU(page.url());
          const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
          const { variantPrice, compareAtPrice, costPerItem } = calculatePrices(
            displayedCostPerItemText
          );
          allVariantsData.push({
            [masterKey.toLowerCase()]: currentMasterLabel,
            sku,
            variantPrice,
            compareAtPrice,
            costPerItem,
            mainImage,
            option2: "", // Explicitly empty as no slave
          });
        }
      }
    }

    // 7. Shopify rows mapping - CENTRALIZED COLUMN NAMES
    const commonShopifyRow = {
      "Handle": handle,
      "Title": title,
      "Body (HTML)": descriptionHtml,
      "Vendor": "Macy's", // Or dynamic from brand if applicable
      "Type": "Footwear", // Or dynamic from breadcrumbs
      "Tags": finalProductTags,
      "Published": "TRUE",
      "Option1 Name": masterKey ? capitalizeFirst(masterKey) : "",
      "Option2 Name": slaveKey ? capitalizeFirst(slaveKey) : "",
      "Option3 Name": "",
      "Option3 Value": "",
      "Variant SKU": "", // Will be filled per variant
      "Variant Grams": "",
      "Variant Price": "", // Will be filled per variant
      "Variant Compare At Price": "", // Will be filled per variant
      "Variant Cost": "", // Will be filled per variant
      "Variant Taxable": "TRUE",
      "Variant Barcode": "",
      "Image Src": "", // Will be filled per variant for first row, then empty
      "Image Position": 1,
      "Image Alt Text": "", // Will be filled per variant
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
      "Variant Image": "", // Will be filled per variant
      "Variant Weight Unit": "oz",
      "Variant Tax Code": "",
      "Cost per item": "", // Redundant, but keeping for compatibility if needed
      "Price": "", // Redundant, but keeping for compatibility if needed
      "Compare At Price": "", // Redundant, but keeping for compatibility if needed
      "original_product_url": url,
    };

    const allShopifyRows = [];
    const chunkSize = 100; // Shopify limit for product variants in one row

    if (allVariantsData.length === 0) {
        // Fallback for no variants found at all, but product exists
        allVariantsData.push({
            sku: extractSKU(url),
            variantPrice: commonShopifyRow["Variant Price"], // Default to page's current if no variant price
            compareAtPrice: commonShopifyRow["Variant Compare At Price"],
            costPerItem: commonShopifyRow["Variant Cost"],
            mainImage: await extractMainImage(page),
            option1: "",
            option2: "",
        });
    }

    // Process in chunks (if needed, though often for >100 variants is rare for one product)
    for (let i = 0; i < allVariantsData.length; i += chunkSize) {
      const chunk = allVariantsData.slice(i, i + chunkSize);
      const chunkHandle = i === 0 ? handle : `${handle}-${Math.floor(i / chunkSize) + 1}`;
      const chunkTitle = i === 0 ? title : `${title} (Part ${Math.floor(i / chunkSize) + 1})`;

      for (let j = 0; j < chunk.length; j++) {
        const variant = chunk[j];
        const row = { ...commonShopifyRow }; // Start with common data

        row["Handle"] = chunkHandle;
        row["Title"] = (i === 0 && j === 0) ? title : ""; // Only on first row of first chunk
        row["Body (HTML)"] = (i === 0 && j === 0) ? descriptionHtml : ""; // Only on first row of first chunk
        row["Tags"] = (i === 0 && j === 0) ? finalProductTags : "";

        // Fill variant specific data
        row["Variant SKU"] = variant.sku || "";
        row["Variant Price"] = variant.variantPrice || "";
        row["Variant Compare At Price"] = variant.compareAtPrice || "";
        row["Variant Cost"] = variant.costPerItem || "";
        row["Cost per item"] = variant.costPerItem || "";
        row["Price"] = variant.variantPrice || "";
        row["Compare At Price"] = variant.compareAtPrice || "";
        row["original_product_url"] = (i === 0 && j === 0) ? url : "";


        if (masterKey) {
            row["Option1 Name"] = capitalizeFirst(masterKey);
            row["Option1 Value"] = variant?.[masterKey.toLowerCase()] || "";
        }
        if (slaveKey) {
            row["Option2 Name"] = capitalizeFirst(slaveKey);
            row["Option2 Value"] = variant?.[slaveKey.toLowerCase()] || "";
        }

        // Image handling: Only the first variant in the *first chunk* gets the main image
        // Shopify typically uses the first variant's image for the main product image in the CSV.
        // Subsequent images are added as separate rows, but we are producing flattened variants.
        // For simplicity and direct Shopify import, we'll assign the first image to the first variant row.
        // For other variants, we set "Variant Image" to their specific image.
        if (i === 0 && j === 0) {
            row["Image Src"] = variant.mainImage || ""; // Main product image for the first row
        }
        row["Variant Image"] = variant.mainImage || ""; // This is for the variant's specific image

        allShopifyRows.push(row);
      }
    }

    console.log(`✅ Finished extracting data for ${allShopifyRows.length} Shopify rows.`);
    return allShopifyRows;
  } catch (error) {
    console.error(`❌ CRITICAL ERROR in extractMacyProductData for URL: ${url}:`, error);
    throw error;
  }
}