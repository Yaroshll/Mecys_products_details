// helpers/extractors.js
import { extractOriginalPrice } from "./price.js";
import { extractDescription } from "./description.js";
import { extractVariants } from "./variants.js";

export async function extractMacysProductData(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const handle = url.split("?")[0].split("/").pop().replace(/[^a-zA-Z0-9-_]/g, "_");
  const title = await page.$eval("h1.product-title", el => {
    const brand = el.querySelector("a")?.textContent.trim() || "";
    const name = el.querySelector("span")?.textContent.trim() || "";
    return `${brand}, ${name}`;
  }).catch(() => "");

  const breadcrumbs = await page.$$eval("ol li.p-menuitem > a", anchors =>
    anchors.map(a => a.textContent.trim()).filter(Boolean).join(", ")
  ).catch(() => "");

  const mainImage = await page.$eval("div.picture-container img", img => img.src).catch(() => "");

  const originalPrice = await extractOriginalPrice(page);
  const variantPrice = originalPrice ? +(originalPrice * 1.3).toFixed(2) : 0;

  const description = await extractDescription(page);
  const variants = await extractVariants(page);

  const allShopifyRows = variants.map((variant, idx) => ({
    Handle: handle,
    Title: idx === 0 ? title : "",
    "Body (HTML)": idx === 0 ? description : "",
    "Option1 Name": "Color",
    "Option1 Value": variant.color || "",
    "Option2 Name": "Size",
    "Option2 Value": variant.size || "",
    "Cost per item": originalPrice || "",
    "Variant Price": variantPrice,
    "Image Src": idx === 0 ? variant.colorImage || mainImage : "",
    Tags: breadcrumbs,
    "Vendor": "Macys",
    "Variant SKU": "",
    "Variant Fulfillment Service": "manual",
    "Variant Inventory Tracker": "shopify",
    "Variant Inventory Policy": "deny",
    original_product_url: idx === 0 ? url : "",
  }));

  return allShopifyRows;
}