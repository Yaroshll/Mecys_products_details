import { SELECTORS } from './constants.js';

export async function extractTitle(page) {
  try {
    const brand = await page.$eval(SELECTORS.PRODUCT.BRAND, el => el.textContent.trim());
    const productName = await page.$eval(SELECTORS.PRODUCT.PRODUCT_NAME, el => el.textContent.trim());
    return `${brand}, ${productName}`;
  } catch {
    return '';
  }
}

export async function extractPrice(page) {
  try {
    const priceText = await page.$eval(SELECTORS.PRODUCT.PRICE, el => el.getAttribute('aria-label'));
    const match = priceText.match(/Previous Price\s+AED\s+([\d.]+)/);
    return match ? match[1] : '0';
  } catch {
    return '0';
  }
}

export async function extractMainImage(page) {
  try {
    return await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, img => img.src);
  } catch {
    return '';
  }
}

export async function extractBreadcrumbs(page) {
  try {
    return await page.$$eval(SELECTORS.PRODUCT.BREADCRUMBS, anchors => 
      anchors.map(a => a.textContent.trim().replace(/,/g, ';')).join(',')
    );
  } catch {
    return '';
  }
}

export async function extractDescription(page) {
  try {
    await page.click(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, { timeout: 5000 });
    return await page.$eval(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, el => el.textContent.trim());
  } catch {
    return '';
  }
}

export async function getColorVariants(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.COLOR_OPTIONS, { timeout: 5000 });
    return await page.$$eval(SELECTORS.PRODUCT.COLOR_OPTIONS, options => 
      options.map(option => ({
        element: option.querySelector('input[type="radio"]'),
        label: option.querySelector('input[type="radio"]').getAttribute('aria-label').replace('Color: ', '')
      }))
    );
  } catch {
    return [];
  }
}

export async function getSizeVariants(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.SIZE_OPTIONS, { timeout: 5000 });
    return await page.$$eval(SELECTORS.PRODUCT.SIZE_OPTIONS, options => 
      options.map(option => 
        option.querySelector('span.label.updated-label.margin-left-xxxs').textContent.trim()
      )
    );
  } catch {
    return [];
  }
}