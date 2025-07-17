// helpers/price.js
export async function extractOriginalPrice(page) {
  const priceLabel = await page.$eval('div.price-wrapper span[aria-label*="Previous Price"]', el => el.getAttribute('aria-label')).catch(() => '');
  const match = priceLabel.match(/Previous Price\s+AED\s+([\d.]+)/i);
  return match ? parseFloat(match[1]) : null;
}
