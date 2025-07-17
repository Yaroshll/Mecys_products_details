// helpers/description.js
export async function extractDescription(page) {
  try {
    // If the button exists, click it
    const button = await page.$('button.switch.link-med');
    if (button) await button.click();

    // Wait for the description or fallback to extract without clicking
    await page.waitForSelector('div#details-drawer > div > p', { timeout: 5000 }).catch(() => {});

    const mainDescription = await page.$eval(
      'div#details-drawer > div > p',
      (el) => el.innerHTML.trim()
    ).catch(() => "");

    const featuresList = await page.$$eval(
      'ul li.column[data-auto="product-summary-section"] div ul li span',
      (items) => items.map((el) => `<li>${el.innerHTML.trim()}</li>`).join("")
    ).catch(() => "");

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
