export async function getDescription(page) {
  try {
    await page.click('button.switch.link-med', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    return await page.$eval('div#details-drawer > div > p', el => el.innerText.trim());
  } catch {
    return '';
  }
}
