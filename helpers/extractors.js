// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from "./constants.js";

// Enhanced click function with better error handling
async function safeClick(element, timeout = 10000) {
  try {
    await element.scrollIntoViewIfNeeded();
    await element.click({ timeout });
    await page.waitForTimeout(1000); // Wait for UI to update
  } catch (error) {
    console.warn(`Standard click failed, trying JS click: ${error.message}`);
    try {
      await element.evaluate(el => {
        el.scrollIntoView({block: "center", behavior: "instant"});
        el.click();
      });
      await page.waitForTimeout(1500); // Extra wait after JS click
    } catch (jsError) {
      console.error(`Both click methods failed: ${jsError.message}`);
      throw jsError;
    }
  }
}

// Improved variant selection logic
export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  await gotoMacyWithRetries(page, url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const handle = formatHandleFromUrl(url);
  const { brand, productName, title } = await extractTitle(page);
  const descriptionHtml = await extractFullDescription(page);
  const breadcrumbs = await extractBreadcrumbs(page);
  
  const finalProductTags = [
    ...new Set([
      ...breadcrumbs.split(" > ").map(t => t.trim()),
      ...(extraTags ? extraTags.split(",").map(t => t.trim()) : [])
    ])
  ].join(", ");

  // Get variant option names
  let option1Name = "Color";
  let option2Name = "Size";
  
  try {
    const colorOptionEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
    if (colorOptionEl) option1Name = (await colorOptionEl.textContent()).replace(':', '').trim();
  } catch {}
  
  try {
    const sizeOptionEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
    if (sizeOptionEl) option2Name = (await sizeOptionEl.textContent()).replace(':', '').trim();
  } catch {}

  // Process color variants if they exist
  const colorSwatches = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
  
  if (colorSwatches.length > 0) {
    console.log(`Found ${colorSwatches.length} color variants`);
    
    // Process each color one by one
    for (let i = 0; i < colorSwatches.length; i++) {
      // Re-fetch elements to avoid staleness
      const currentColors = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
      const colorSwatch = currentColors[i];
      
      if (!colorSwatch) {
        console.warn(`Color at index ${i} not found, skipping`);
        continue;
      }

      // Get color value before clicking
      const colorValue = await colorSwatch.evaluate(el => 
        el.getAttribute('aria-label')?.replace('Color: ', '') || 
        el.querySelector('img')?.alt || 
        el.textContent.trim()
      );

      console.log(`Processing color ${i + 1}/${colorSwatches.length}: ${colorValue}`);
      
      // Click the color swatch
      await safeClick(colorSwatch);
      await page.waitForTimeout(2000); // Wait for color change to apply
      
      // Verify color was selected
      const selectedColor = await getSelectedColorValue(page);
      if (selectedColor.toLowerCase() !== colorValue.toLowerCase()) {
        console.warn(`Color selection failed. Expected ${colorValue}, got ${selectedColor}`);
      }
      
      const mainImage = await extractMainImage(page);
      
      // Process sizes for this color
      const sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
      
      if (sizeChips.length > 0) {
        console.log(`Found ${sizeChips.length} sizes for color ${colorValue}`);
        
        for (let j = 0; j < sizeChips.length; j++) {
          const currentSizes = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
          const sizeChip = currentSizes[j];
          
          if (!sizeChip) {
            console.warn(`Size at index ${j} not found, skipping`);
            continue;
          }
          
          // Get size value before clicking
          const sizeValue = await sizeChip.evaluate(el => 
            el.textContent.trim() || 
            el.getAttribute('aria-label')?.replace('Size: ', '')
          );
          
          console.log(`Processing size ${j + 1}/${sizeChips.length}: ${sizeValue}`);
          
          // Click the size chip
          await safeClick(sizeChip);
          await page.waitForTimeout(1500); // Wait for size selection to apply
          
          // Verify size was selected
          const selectedSize = await getSelectedSizeValue(page);
          if (selectedSize.toLowerCase() !== sizeValue.toLowerCase()) {
            console.warn(`Size selection failed. Expected ${sizeValue}, got ${selectedSize}`);
          }
          
          // Get pricing information
          const displayedPrice = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
          
          // Add to results
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
            compareAtPrice,
            costPerItem,
            mainImage,
            imageAltText: `${title} - ${colorValue} ${sizeValue}`,
            url
          }));
        }
      } else {
        // No sizes, just color variant
        const displayedPrice = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
        
        allShopifyRows.push(createShopifyRow({
          handle,
          title: allShopifyRows.length === 0 ? title : "",
          descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
          tags: allShopifyRows.length === 0 ? finalProductTags : "",
          option1Name,
          option1Value: colorValue,
          variantPrice,
          compareAtPrice,
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${colorValue}`,
          url
        }));
      }
    }
  } else {
    // Handle products with no colors (just sizes or no variants)
    const sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
    
    if (sizeChips.length > 0) {
      console.log(`Found ${sizeChips.length} size variants`);
      
      for (let i = 0; i < sizeChips.length; i++) {
        const currentSizes = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeChip = currentSizes[i];
        
        if (!sizeChip) continue;
        
        const sizeValue = await sizeChip.evaluate(el => 
          el.textContent.trim() || 
          el.getAttribute('aria-label')?.replace('Size: ', '')
        );
        
        console.log(`Processing size ${i + 1}/${sizeChips.length}: ${sizeValue}`);
        
        await safeClick(sizeChip);
        await page.waitForTimeout(1500);
        
        const selectedSize = await getSelectedSizeValue(page);
        const mainImage = await extractMainImage(page);
        const displayedPrice = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
        
        allShopifyRows.push(createShopifyRow({
          handle,
          title: allShopifyRows.length === 0 ? title : "",
          descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
          tags: allShopifyRows.length === 0 ? finalProductTags : "",
          option1Name: "Size",
          option1Value: sizeValue,
          variantPrice,
          compareAtPrice,
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${sizeValue}`,
          url
        }));
      }
    } else {
      // No variants at all
      console.log("No variants found for this product");
      const mainImage = await extractMainImage(page);
      const displayedPrice = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
      
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
  }

  return allShopifyRows;
}

// Helper function to get the currently selected color
async function getSelectedColorValue(page) {
  try {
    // First try to get from the displayed color element
    return await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim());
  } catch {
    try {
      // Fallback to checking the selected swatch
      const selectedSwatch = await page.$(
        `${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}[aria-checked="true"], ` +
        `${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}.selected`
      );
      
      if (selectedSwatch) {
        // Try to get from image alt text
        const imgAlt = await selectedSwatch.$eval("img", img => img.alt).catch(() => "");
        if (imgAlt) return imgAlt.replace("Color: ", "").trim();
        
        // Try to get from aria-label
        const ariaLabel = await selectedSwatch.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel.replace("Color: ", "").trim();
        
        // Fallback to text content
        return (await selectedSwatch.textContent()).trim();
      }
    } catch (error) {
      console.warn("Error getting selected color:", error);
    }
  }
  return "Unknown Color";
}

// Helper function to get the currently selected size
async function getSelectedSizeValue(page) {
  try {
    // First try to get from the displayed size element
    return await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim());
  } catch {
    try {
      // Fallback to checking the selected size chip
      const selectedChip = await page.$(
        `${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}[aria-checked="true"], ` +
        `${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}.selected`
      );
      
      if (selectedChip) {
        return (await selectedChip.textContent()).trim();
      }
    } catch (error) {
      console.warn("Error getting selected size:", error);
    }
  }
  return "Unknown Size";
}