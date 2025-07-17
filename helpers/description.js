// helpers/description.js
export async function extractDescription(page) {
  try {
    // Click the details button
    await page.locator('button.switch.link-med').click({ timeout: 10000 });

    await page.waitForSelector('div#details-drawer > div > p', { timeout: 5000 });
    const mainDescription = await page.$eval(
      'div#details-drawer > div > p',
      (el) => el.innerHTML.trim()
    );

    // Extract Features List
    const featuresList = await page.$$eval(
      'ul li.column[data-auto="product-summary-section"] div ul li span',
      (items) => items.map((el) => `<li>${el.innerHTML.trim()}</li>`).join("")
    );

    let featuresHtml = "";
    if (featuresList) {
      featuresHtml = `<h4>Features</h4><ul>${featuresList}</ul>`;
    }

    return `${mainDescription}\n${featuresHtml}`;
  } catch (err) {
    console.warn("⚠️ Could not extract description:", err.message);
    return "";
  }
}
