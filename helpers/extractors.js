// helpers/extractors.js
import { extractVariants } from "./variants.js";
import { extractDescription } from "./description.js";

export async function extractMacysProductData(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.info(`✅ Page loaded: ${url}`);

    const title = await page
      .$eval("h1.product-title", (el) => {
        const brand = el.querySelector("a")?.textContent.trim() || "";
        const name = el.querySelector("span")?.textContent.trim() || "";
        return `${brand}, ${name}`;
      })
      .catch(() => "");
    console.info(`✅ Title extracted: ${title}`);

    const breadcrumbs = await page
      .$$eval("nav.breadcrumbs a", (links) => links.map((a) => a.textContent.trim()).join(" > "))
      .catch(() => "");
    console.info(`✅ Breadcrumbs extracted: ${breadcrumbs}`);

    const mainImage = await page
      .$eval("img.primary-image", (img) => img.src)
      .catch(() => "");
    console.info(`✅ Main image extracted: ${mainImage}`);

    const price = await page
      .$eval("span.price-red", (el) => el.textContent.replace(/[^\d.]/g, "").trim())
      .catch(() => "");
    console.info(`✅ Price extracted: ${price}`);

    const originalPrice = await page
      .$eval("span.price-strike", (el) => el.textContent.replace(/[^\d.]/g, "").trim())
      .catch(() => "");
    console.info(`✅ Original Price extracted: ${originalPrice}`);

    const color = await page
      .$eval('span[data-testid="selected-color-name"]', (el) => el.textContent.trim())
      .catch(() => "");
    console.info(`✅ Color extracted: ${color}`);

    const description = await extractDescription(page);
    console.info(`✅ Description extracted: ${description?.substring(0, 100)}...`);

    const variants = await extractVariants(page);
    console.info(`✅ Variants extracted: ${variants.length} variants`);

    return {
      Handle: url.split("/").pop().split("?")[0],
      Title: title,
      Tags: breadcrumbs,
      Body: description,
      "Variant Price": price,
      "Compare At Price": originalPrice,
      "Image Src": mainImage,
      "Option1 Value": color,
      Variants: variants,
    };
  } catch (error) {
    console.error(`❌ Error scraping: ${url} ${error.message}`);
    return null;
  }
}
