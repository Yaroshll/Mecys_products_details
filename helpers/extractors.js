import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from "./constants.js";

async function safeClick(element, page, timeout = 15000) {
  try {
    await element.scrollIntoViewIfNeeded();
    await element.click({ timeout });
    await page.waitForTimeout(1000);
  } catch (error) {
    console.warn(`Standard click failed: ${error.message}`);
    try {
      await element.evaluate(el => {
        el.scrollIntoView({block: "center", behavior: "instant"});
        el.click();
      });
      await page.waitForTimeout(1500);
    } catch (jsError) {
      console.error(`JS click failed: ${jsError.message}`);
      throw jsError;
    }
  }
}

export async function extractTitle(page) {
  let brand = "", productName = "";
  try {
    brand = (await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND))?.trim() || "";
  } catch {}
  try {
    productName = (await page.textContent(SELECTORS.PRODUCT.TITLE_NAME))?.trim() || "";
  } catch {}
  return {
    brand,
    productName,
    title: brand && productName ? `${brand}, ${productName}` : brand || productName || ""
  };
}

export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { timeout: 3000 });
    return await page.textContent(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE);
  } catch {
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { timeout: 3000 });
      return await page.textContent(SELECTORS.PRODUCT.CURRENT_PRICE);
    } catch {
      return "$0.00";
    }
  }
}

export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { timeout: 5000 });
    return await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, img => img.dataset.src || img.src);
  } catch {
    return "";
  }
}

export async function extractBreadcrumbs(page) {
  try {
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { timeout: 15000 });
    return await page.$$eval(SELECTORS.BREADCRUMBS.LINKS, anchors => 
      anchors.map(a => {
        const text = a.textContent.trim();
        return text && !text.match(/home|macys/i) ? text : null;
      }).filter(Boolean).join(", ")
    );
  } catch {
    return "";
  }
}

export async function extractFullDescription(page) {
  let description = "";
  try {
    // Click description tab if exists
    const descTab = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first();
    if (await descTab.isVisible()) {
      await safeClick(descTab, page);
      await page.waitForTimeout(1000);
    }
    
    // Get description content
    await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, { timeout: 5000 });
    description = await page.$eval(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, el => el.innerHTML);
  } catch (error) {
    console.warn("Could not extract full description:", error.message);
  }
  return description;
}

export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  
  try {
    await gotoMacyWithRetries(page, url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const { title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);
    const handle = formatHandleFromUrl(url);
    
    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(",").map(t => t.trim()),
        ...(extraTags ? extraTags.split(",").map(t => t.trim()) : [])
      ])
    ].join(", ");

    // Process color variants
    const colorSwatches = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    if (colorSwatches.length > 0) {
      console.log(`Processing ${colorSwatches.length} color variants...`);
      
      for (let i = 0; i < colorSwatches.length; i++) {
        const currentColors = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
        const colorSwatch = currentColors[i];
        
        if (!colorSwatch) continue;
        
        // Get color name before clicking
        const colorName = await colorSwatch.evaluate(el => 
          el.getAttribute('aria-label')?.replace('Color: ', '') || 
          el.querySelector('img')?.alt || 
          el.textContent.trim()
        );
        
        console.log(`Selecting color: ${colorName}`);
        await safeClick(colorSwatch, page);
        await page.waitForTimeout(2000);
        
        const mainImage = await extractMainImage(page);
        
        // Process sizes for this color
        const sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        if (sizeChips.length > 0) {
          console.log(`Found ${sizeChips.length} sizes for color ${colorName}`);
          
          for (let j = 0; j < sizeChips.length; j++) {
            const currentSizes = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            const sizeChip = currentSizes[j];
            
            if (!sizeChip) continue;
            
            const sizeName = await sizeChip.evaluate(el => el.textContent.trim());
            console.log(`Selecting size: ${sizeName}`);
            await safeClick(sizeChip, page);
            await page.waitForTimeout(1500);
            
            const priceText = await extractDisplayedCostPerItem(page);
            const prices = calculatePrices(priceText);
            
            allShopifyRows.push({
              Handle: handle,
              Title: allShopifyRows.length === 0 ? title : "",
              "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
              Vendor: "Macy's",
              Type: "Footwear",
              Tags: allShopifyRows.length === 0 ? finalProductTags : "",
              "Option1 Name": "Color",
              "Option1 Value": colorName,
              "Option2 Name": "Size",
              "Option2 Value": sizeName,
              "Variant SKU": extractSKU(url),
              "Variant Price": prices.variantPrice,
              "Variant Compare At Price": prices.compareAtPrice,
              "Cost per item": prices.costPerItem,
              "Image Src": mainImage,
              "Image Alt Text": `${title} - ${colorName} ${sizeName}`,
              "Variant Image": mainImage,
              original_product_url: url
            });
          }
        } else {
          // No sizes, just color
          const priceText = await extractDisplayedCostPerItem(page);
          const prices = calculatePrices(priceText);
          
          allShopifyRows.push({
            Handle: handle,
            Title: allShopifyRows.length === 0 ? title : "",
            "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
            Vendor: "Macy's",
            Type: "Footwear",
            Tags: allShopifyRows.length === 0 ? finalProductTags : "",
            "Option1 Name": "Color",
            "Option1 Value": colorName,
            "Variant SKU": extractSKU(url),
            "Variant Price": prices.variantPrice,
            "Variant Compare At Price": prices.compareAtPrice,
            "Cost per item": prices.costPerItem,
            "Image Src": mainImage,
            "Image Alt Text": `${title} - ${colorName}`,
            "Variant Image": mainImage,
            original_product_url: url
          });
        }
      }
    } else {
      // Handle products with no colors
      const sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
      
      if (sizeChips.length > 0) {
        console.log(`Processing ${sizeChips.length} size variants...`);
        
        for (let i = 0; i < sizeChips.length; i++) {
          const currentSizes = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
          const sizeChip = currentSizes[i];
          
          if (!sizeChip) continue;
          
          const sizeName = await sizeChip.evaluate(el => el.textContent.trim());
          console.log(`Selecting size: ${sizeName}`);
          await safeClick(sizeChip, page);
          await page.waitForTimeout(1500);
          
          const mainImage = await extractMainImage(page);
          const priceText = await extractDisplayedCostPerItem(page);
          const prices = calculatePrices(priceText);
          
          allShopifyRows.push({
            Handle: handle,
            Title: allShopifyRows.length === 0 ? title : "",
            "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
            Vendor: "Macy's",
            Type: "Footwear",
            Tags: allShopifyRows.length === 0 ? finalProductTags : "",
            "Option1 Name": "Size",
            "Option1 Value": sizeName,
            "Variant SKU": extractSKU(url),
            "Variant Price": prices.variantPrice,
            "Variant Compare At Price": prices.compareAtPrice,
            "Cost per item": prices.costPerItem,
            "Image Src": mainImage,
            "Image Alt Text": `${title} - ${sizeName}`,
            "Variant Image": mainImage,
            original_product_url: url
          });
        }
      } else {
        // No variants at all
        console.log("Product has no variants");
        const mainImage = await extractMainImage(page);
        const priceText = await extractDisplayedCostPerItem(page);
        const prices = calculatePrices(priceText);
        
        allShopifyRows.push({
          Handle: handle,
          Title: title,
          "Body (HTML)": descriptionHtml,
          Vendor: "Macy's",
          Type: "Footwear",
          Tags: finalProductTags,
          "Variant SKU": extractSKU(url),
          "Variant Price": prices.variantPrice,
          "Variant Compare At Price": prices.compareAtPrice,
          "Cost per item": prices.costPerItem,
          "Image Src": mainImage,
          "Image Alt Text": title,
          "Variant Image": mainImage,
          original_product_url: url
        });
      }
    }
    
    return allShopifyRows;
    
  } catch (error) {
    console.error(`Error extracting product data: ${error.message}`);
    throw error;
  }
}