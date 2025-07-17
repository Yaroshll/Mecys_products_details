export async function extractVariants(page) {
  const results = [];
  const colorLabels = await page.$$('form.colors-form ul.colors li label');
  const option1Name = 'Color';

  for (const colorLabel of colorLabels) {
    await colorLabel.click().catch(() => {});
    await page.waitForTimeout(1000);

    const colorName = await colorLabel.getAttribute('aria-label').then(txt => txt?.replace('Color: ', '') || '');
    const colorImage = await colorLabel.$eval('img', img => img.src).catch(() => '');

    const sizeLabels = await page.$$('fieldset div.cell.shrink label');

    if (sizeLabels.length) {
      for (const sizeLabel of sizeLabels) {
        const size = await sizeLabel.$eval('span', el => el.textContent.trim()).catch(() => '');
        results.push({
          [option1Name]: colorName,
          Size: size,
          mainImage: colorImage,
        });
      }
    } else {
      results.push({
        [option1Name]: colorName,
        Size: '',
        mainImage: colorImage,
      });
    }
  }

  return results;
}
