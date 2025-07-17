// helpers/variants.js
export async function extractVariants(page) {
  const results = [];
  const colorSection = await page.$('div.color-swatches').catch(() => null);
  if (!colorSection) return results;

  const colorItems = await colorSection.$$('form.colors-form ol li label');

  for (const colorLabel of colorItems) {
    await colorLabel.click().catch(() => {});
    await page.waitForTimeout(1000);

    const colorName = await colorLabel.getAttribute('aria-label').catch(() => '');
    const colorImage = await colorLabel.$eval('img', img => img.src).catch(() => '');

    const option1Name = await page.$eval('div.flex-container.align-justify span:nth-child(1)', el => el.textContent.trim().replace(':', '')).catch(() => '');
    const option1Value = await page.$eval('div.flex-container.align-justify span:nth-child(2)', el => el.textContent.trim()).catch(() => '');

    const sizeItems = await page.$$('fieldset div.cell.shrink').catch(() => []);

    if (sizeItems.length) {
      for (const sizeDiv of sizeItems) {
        const sizeLabel = await sizeDiv.$eval('label span.label.updated-label.margin-left-xxxs', el => el.textContent.trim()).catch(() => '');
        results.push({
          color: colorName?.replace('Color: ', '') || '',
          colorImage,
          [option1Name]: option1Value,
          size: sizeLabel
        });
      }
    } else {
      results.push({
        color: colorName?.replace('Color: ', '') || '',
        colorImage,
        [option1Name]: option1Value,
        size: ''
      });
    }
  }

  return results;
}
