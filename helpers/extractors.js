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
  } catch {
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

export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];
  await gotoMacyWithRetries(page, url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const handle = formatHandleFromUrl(url);
  const { title } = await extractTitle(page);
  const descriptionHtml = await extractFullDescription(page);
  const breadcrumbs = await extractBreadcrumbs(page);

  const finalProductTags = [...new Set([
    ...breadcrumbs.split(",").map(t => t.trim()),
    ...(extraTags ? extraTags.split(",").map(t => t.trim()) : [])
  ])].join(", ");

  const initialVariants = await getVariantGroups(page);
  const colors = initialVariants["Color"] || [];
  const sizes = initialVariants["Size"] || [];

  // ✅ أولاً مر على اللون الحالي المعروض أول مرة
  let selectedColorName = "";
  try {
    selectedColorName = await page.$eval(
      SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY,
      el => el.textContent.trim()
    );
  } catch {}

  if (selectedColorName) {
    await processColor(selectedColorName, page, allShopifyRows, {
      title,
      descriptionHtml,
      finalProductTags,
      handle,
      url,
      sizes
    });
  }

  // ✅ ثم مر على باقي الألوان واحد واحد مع السايزات
  for (const color of colors) {
    const colorLabel = await color.anchor.evaluate(el =>
      el.getAttribute('aria-label')?.replace('Color: ', '') ||
      el.querySelector('img')?.alt || el.textContent.trim()
    );

    if (colorLabel !== selectedColorName) {
      await safeClick(color.anchor, page);
      await page.waitForTimeout(1000);
      await processColor(colorLabel, page, allShopifyRows, {
        title,
        descriptionHtml,
        finalProductTags,
        handle,
        url,
        sizes
      });
    }
  }

  if (!colors.length && sizes.length) {
    await processSizeOnly(page, allShopifyRows, {
      title,
      descriptionHtml,
      finalProductTags,
      handle,
      url
    });
  }

  if (!colors.length && !sizes.length) {
    await processSingleVariant(page, allShopifyRows, {
      title,
      descriptionHtml,
      finalProductTags,
      handle,
      url
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

async function processSizeOnly(page, allShopifyRows, context) {
  const { title, descriptionHtml, finalProductTags, handle, url } = context;
  const mainImage = await extractMainImage(page);
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

async function processSingleVariant(page, allShopifyRows, context) {
  const { title, descriptionHtml, finalProductTags, handle, url } = context;
  const mainImage = await extractMainImage(page);
  const priceText = await extractDisplayedCostPerItem(page);
  const { costPerItem, variantPrice, compareAtPrice } = calculatePrices(priceText);

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
