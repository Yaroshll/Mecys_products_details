// helpers/gotoWithRetries.js
export async function gotoWithRetries(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 600000 });
      await page.waitForSelector('h1.product-title', { timeout: 150000 });
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await page.waitForTimeout(20000);
    }
  }
}
