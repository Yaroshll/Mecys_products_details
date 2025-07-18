// helpers/extractors.js
import {
  calculatePrices,
  extractSKU,
  formatHandleFromUrl,
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS } from "./constants.js";

// Function to safely click an element
async function safeClick(element, timeout = 10000) {
  try {
    await element.click({ force: true, timeout });
  } catch (error) {
    console.warn(`Standard click failed, trying JS click: ${error.message}`);
    try {
      await element.evaluate((el) => el.click());
    } catch (jsError) {
      console.error(`Both click methods failed: ${jsError.message}`);
      throw jsError;
    }
  }
}

// Extract brand and product name
export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";
  try {
    brand = (await page.textContent(SELECTORS.PRODUCT.TITLE_BRAND))?.trim() || "";
  } catch {}
  try {
    productName = (await page.textContent(SELECTORS.PRODUCT.TITLE_NAME))?.trim() || "";
  } catch {}
  title = brand && productName ? `${brand}, ${productName}` : brand || productName || "";
  return { brand, productName, title };
}

// Extract price with fallback to current price
export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { timeout: 3000 });
    return await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, (el) => el.textContent.trim());
  } catch {
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.CURRENT_PRICE, { timeout: 3000 });
      return await page.$eval(SELECTORS.PRODUCT.CURRENT_PRICE, (el) => el.textContent.trim());
    } catch {
      return "$0.00";
    }
  }
}

// Extract main product image
export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { timeout: 5000 });
    return await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, (el) => el.dataset.src || el.src || "");
  } catch {
    return "";
  }
}

// Extract breadcrumbs as text
export async function extractBreadcrumbs(page) {
  try {
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { timeout: 15000 });
    return await page.$$eval(SELECTORS.BREADCRUMBS.LINKS, (anchors) =>
      anchors
        .map((a) => {
          const tempDiv = document.createElement("div");
          tempDiv.appendChild(a.cloneNode(true));
          tempDiv.querySelectorAll("svg, .separator-icon, .breadcrumb-icon, [data-auto='icon']").forEach((el) => el.remove());
          let text = tempDiv.textContent.trim();
          return text && text.toLowerCase() !== "home" ? text : null;
        })
        .filter(Boolean)
        .join(" > ")
    );
  } catch {
    return "";
  }
}

// Get selected color value from the page
async function getSelectedColorValue(page) {
  try {
    return await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, (el) => el.textContent.trim());
  } catch {
    const selectedSwatch = await page.$(
      `${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}[aria-checked="true"], ${SELECTORS.PRODUCT.COLOR_RADIO_LABELS}.selected`
    );
    if (selectedSwatch) {
      const imgAlt = await selectedSwatch.$eval("img", (img) => img.alt).catch(() => "");
      if (imgAlt) return imgAlt.replace("Color: ", "").trim();
      const ariaLabel = await selectedSwatch.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.replace("Color: ", "").trim();
      return (await selectedSwatch.textContent()).trim();
    }
  }
  return "Unknown Color";
}

// Get selected size value from the page
async function getSelectedSizeValue(page) {
  try {
    return await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, (el) => el.textContent.trim());
  } catch {
    const selectedChip = await page.$(
      `${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}[aria-checked="true"], ${SELECTORS.PRODUCT.SIZE_RADIO_LABELS}.selected`
    );
    if (selectedChip) {
      return (await selectedChip.textContent()).trim();
    }
  }
  return "Unknown Size";
}

// Wait for image change after variant click
export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page);
  if (anchorToClick) {
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  }
  await safeClick(anchorToClick);
  try {
    await page.waitForFunction(
      (prevImage, selector) => {
        const currImage = document.querySelector(selector);
        return currImage?.src !== prevImage && currImage?.dataset.src !== prevImage;
      },
      oldMainImage,
      SELECTORS.PRODUCT.MAIN_IMAGE,
      { timeout: 10000 }
    );
  } catch {}
  await page.waitForTimeout(2000);
}

// Main variant processing logic
export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  await gotoMacyWithRetries(page, url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5000);

  const handle = formatHandleFromUrl(url);
  const { brand, productName, title } = await extractTitle(page);
  const descriptionHtml = await page.content();
  const breadcrumbs = await extractBreadcrumbs(page);
  const finalProductTags = [...new Set([...breadcrumbs.split(" > ").map((t) => t.trim()), ...(extraTags ? extraTags.split(",").map((t) => t.trim()) : [])])].join(", ");

  let colorSwatches = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
  let sizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

  if (colorSwatches.length > 0) {
    for (const colorSwatch of colorSwatches) {
      await safeClick(colorSwatch);
      await page.waitForTimeout(1000);
      const selectedColor = await getSelectedColorValue(page);
      const mainImage = await extractMainImage(page);
      let updatedSizeChips = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
      if (updatedSizeChips.length > 0) {
        for (const sizeChip of updatedSizeChips) {
          await safeClick(sizeChip);
          await page.waitForTimeout(1000);
          const selectedSize = await getSelectedSizeValue(page);
          const displayedPrice = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
          allShopifyRows.push(createShopifyRow({
            handle,
            title,
            descriptionHtml,
            tags: finalProductTags,
            option1Name: "Color",
            option1Value: selectedColor,
            option2Name: "Size",
            option2Value: selectedSize,
            variantPrice,
            compareAtPrice,
            costPerItem,
            mainImage,
            imageAltText: `${title} - ${selectedColor} ${selectedSize}`,
            url
          }));
        }
      } else {
        const displayedPrice = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
        allShopifyRows.push(createShopifyRow({
          handle,
          title,
          descriptionHtml,
          tags: finalProductTags,
          option1Name: "Color",
          option1Value: selectedColor,
          variantPrice,
          compareAtPrice,
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${selectedColor}`,
          url
        }));
      }
    }
  } else if (sizeChips.length > 0) {
    for (const sizeChip of sizeChips) {
      await safeClick(sizeChip);
      await page.waitForTimeout(1000);
      const selectedSize = await getSelectedSizeValue(page);
      const mainImage = await extractMainImage(page);
      const displayedPrice = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(displayedPrice);
      allShopifyRows.push(createShopifyRow({
        handle,
        title,
        descriptionHtml,
        tags: finalProductTags,
        option1Name: "Size",
        option1Value: selectedSize,
        variantPrice,
        compareAtPrice,
        costPerItem,
        mainImage,
        imageAltText: `${title} - ${selectedSize}`,
        url
      }));
    }
  } else {
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

  return allShopifyRows;
}

// Create a Shopify row object
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
    Handle: handle,
    Title: title,
    "Body (HTML)": descriptionHtml,
    Vendor: "Macy's",
    Type: "Footwear",
    Tags: tags,
    Published: "TRUE",
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
    Price: variantPrice,
    "Compare At Price": compareAtPrice,
    original_product_url: url,
  };
}
