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
    try {
      await element.evaluate((el) => {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.click();
      });
      await page.waitForTimeout(1500);
    } catch (jsError) {
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
  return { brand, productName, title: brand && productName ? `${brand}, ${productName}` : brand || productName || "" };
}

export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { timeout: 3000 });
    return await page.textContent(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE);
  } catch {
    return "$0.00";
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
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { timeout: 10000 });
    return await page.$$eval(SELECTORS.BREADCRUMBS.LINKS, anchors =>
      anchors.map(a => a.textContent.trim()).filter(text => text && !/home|macys/i.test(text)).join(", ")
    );
  } catch {
    return "";
  }
}

export async function extractFullDescription(page) {
  try {
    const descButton = await page.$(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    if (descButton) await safeClick(descButton, page);
    await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { timeout: 5000 });
    return await page.$eval(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, el => el.innerHTML);
  } catch {
    return "";
  }
}

async function getVariantGroups(page) {
  const groups = {};
  const variantSections = await page.$$('div[data-module-type="ProductDetailVariationSelector"] > div');

  for (const section of variantSections) {
    const titleHandle = await section.$('div > span');
    const title = titleHandle ? (await titleHandle.textContent()).trim() : "";
    if (!title) continue;
    const anchors = await section.$$('div > ul > li > a');
    groups[title] = anchors.map(anchor => ({ anchor }));
  }
  return groups;
}

export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  await gotoMacyWithRetries(page, url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const { title } = await extractTitle(page);
  const descriptionHtml = await extractFullDescription(page);
  const breadcrumbs = await extractBreadcrumbs(page);
  const handle = formatHandleFromUrl(url);

  const finalProductTags = [...new Set([
    ...breadcrumbs.split(",").map(t => t.trim()),
    ...(extraTags ? extraTags.split(",").map(t => t.trim()) : [])
  ])].join(", ");

  const initialVariants = await getVariantGroups(page);
  const colors = initialVariants["Color"] || [];
  const sizes = initialVariants["Size"] || [];

  // ✅ Get selected color first
  let selectedColorName = "";
  try {
    selectedColorName = await page.$eval(
      SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY,
      el => el.textContent.trim()
    );
  } catch {}

  if (selectedColorName) {
    await processColor(selectedColorName, page, allShopifyRows, { title, descriptionHtml, finalProductTags, handle, url, sizes });
  }

  for (const color of colors) {
    const colorLabel = await color.anchor.evaluate(el =>
      el.getAttribute('aria-label')?.replace('Color: ', '') ||
      el.querySelector('img')?.alt || el.textContent.trim()
    );
    if (colorLabel !== selectedColorName) {
      await safeClick(color.anchor, page);
      await page.waitForTimeout(1000);
      await processColor(colorLabel, page, allShopifyRows, { title, descriptionHtml, finalProductTags, handle, url, sizes });
    }
  }

  if (!colors.length && sizes.length) {
    for (const size of sizes) {
      await safeClick(size.anchor, page);
      await page.waitForTimeout(1000);
      const sizeLabel = await size.anchor.evaluate(el => el.textContent.trim());
      const priceText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);
      const mainImage = await extractMainImage(page);

      allShopifyRows.push({
        Handle: handle,
        Title: allShopifyRows.length === 0 ? title : "",
        "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
        Vendor: "Macy's",
        Type: "Footwear",
        Tags: allShopifyRows.length === 0 ? finalProductTags : "",
        "Option1 Name": "Size",
        "Option1 Value": sizeLabel,
        "Variant SKU": extractSKU(url),
        "Variant Price": variantPrice,
        "Variant Compare At Price": compareAtPrice,
        "Cost per item": costPerItem,
        "Image Src": mainImage,
        "Image Alt Text": `${title} - ${sizeLabel}`,
        "Variant Image": mainImage,
        original_product_url: url
      });
    }
  }

  if (!colors.length && !sizes.length) {
    const priceText = await extractDisplayedCostPerItem(page);
    const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);
    const mainImage = await extractMainImage(page);

    allShopifyRows.push({
      Handle: handle,
      Title: title,
      "Body (HTML)": descriptionHtml,
      Vendor: "Macy's",
      Type: "Footwear",
      Tags: finalProductTags,
      "Variant SKU": extractSKU(url),
      "Variant Price": variantPrice,
      "Variant Compare At Price": compareAtPrice,
      "Cost per item": costPerItem,
      "Image Src": mainImage,
      "Image Alt Text": title,
      "Variant Image": mainImage,
      original_product_url: url
    });
  }

  return allShopifyRows;
}

async function processColor(colorLabel, page, allShopifyRows, context) {
  const { title, descriptionHtml, finalProductTags, handle, url, sizes } = context;
  const mainImage = await extractMainImage(page);

  if (sizes.length > 0) {
    const refreshedSizes = await getVariantGroups(page);
    const updatedSizes = refreshedSizes["Size"] || [];
    for (const size of updatedSizes) {
      await safeClick(size.anchor, page);
      await page.waitForTimeout(1000);
      const sizeLabel = await size.anchor.evaluate(el => el.textContent.trim());
      const priceText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

      allShopifyRows.push({
        Handle: handle,
        Title: allShopifyRows.length === 0 ? title : "",
        "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
        Vendor: "Macy's",
        Type: "Footwear",
        Tags: allShopifyRows.length === 0 ? finalProductTags : "",
        "Option1 Name": "Color",
        "Option1 Value": colorLabel,
        "Option2 Name": "Size",
        "Option2 Value": sizeLabel,
        "Variant SKU": extractSKU(url),
        "Variant Price": variantPrice,
        "Variant Compare At Price": compareAtPrice,
        "Cost per item": costPerItem,
        "Image Src": mainImage,
        "Image Alt Text": `${title} - ${colorLabel} ${sizeLabel}`,
        "Variant Image": mainImage,
        original_product_url: url
      });
    }
  } else {
    const priceText = await extractDisplayedCostPerItem(page);
    const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

    allShopifyRows.push({
      Handle: handle,
      Title: allShopifyRows.length === 0 ? title : "",
      "Body (HTML)": allShopifyRows.length === 0 ? descriptionHtml : "",
      Vendor: "Macy's",
      Type: "Footwear",
      Tags: allShopifyRows.length === 0 ? finalProductTags : "",
      "Option1 Name": "Color",
      "Option1 Value": colorLabel,
      "Variant SKU": extractSKU(url),
      "Variant Price": variantPrice,
      "Variant Compare At Price": compareAtPrice,
      "Cost per item": costPerItem,
      "Image Src": mainImage,
      "Image Alt Text": `${title} - ${colorLabel}`,
      "Variant Image": mainImage,
      original_product_url: url
    });
  }
}
