import { extractVariants } from "./variants.js";
import { getDescription } from "./description.js";
import { formatHandleFromUrl, calculatePrices } from "./utils.js";

export async function extractProductData(page, url) {
  const handle = formatHandleFromUrl(url);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const title = await page.$eval('h1.product-title', el => {
    const brand = el.querySelector('a')?.textContent.trim() || '';
    const name = el.querySelector('span')?.textContent.trim() || '';
    return `${brand}, ${name}`;
  }).catch(() => '');

  const breadcrumbs = await page.$$eval('div.breadcrumbs ul li a', els =>
    els.map(e => e.textContent.trim()).filter(e => e.toLowerCase() !== 'home')
  ).catch(() => []);

  const mainImage = await page.$eval('img.main-img', img => img.src).catch(() => '');

  const priceText = await page.$eval('span.price-red span[aria-label*="Current Price"]', el => el.textContent).catch(() => '');
  const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;

  const originalPriceText = await page.$eval('span.price-strike', el => el.textContent).catch(() => '');
  const originalPrice = parseFloat(originalPriceText.replace(/[^\d.]/g, "")) || price;

  const color = await page.$eval('span[data-testid="selected-color-name"]', el => el.textContent.trim()).catch(() => '');

  const description = await getDescription(page);

  const variants = await extractVariants(page);

  return {
    handle,
    title,
    breadcrumbs,
    mainImage,
    price,
    originalPrice,
    color,
    description,
    variants,
    url,
  };
}
