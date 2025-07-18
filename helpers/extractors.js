import { SELECTORS } from './constants.js';

export async function extractTitle(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.TITLE, { timeout: 5000 });
    const titleElement = await page.$(SELECTORS.PRODUCT.TITLE);
    
    // Extract brand from the <a> tag within h1
    const brand = await titleElement.$eval(SELECTORS.PRODUCT.BRAND + ' a', el => el.textContent.trim());
    
    // Extract product name from the <span> tag within h1
    const productName = await titleElement.$eval(SELECTORS.PRODUCT.PRODUCT_NAME + ' span', el => el.textContent.trim());
    
    console.log('✅ Title extracted successfully.');
    return `${brand}, ${productName}`;
  } catch (error) {
    console.log('⚠️ Title not found.', error.message);
    return '';
  }
}

export async function extractPrice(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.PRICE, { timeout: 5000 });
    const priceText = await page.$eval(SELECTORS.PRODUCT.PRICE, el => el.getAttribute('aria-label'));
    const match = priceText.match(/AED\s+([\d.,]+)/);
    if (match) {
      console.log(`✅ Price extracted: ${match[1]}`);
      return match[1].replace(/,/g, '');
    }
    console.log('⚠️ Price format mismatch.');
    return '0';
  } catch {
    console.log('⚠️ Price not found.');
    return '0';
  }
}

export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { timeout: 5000 });
    const imageUrl = await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, img => img.src);
    console.log('✅ Main image extracted.');
    return imageUrl;
  } catch {
    console.log('⚠️ Main image not found.');
    return '';
  }
}

export async function extractBreadcrumbs(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.BREADCRUMBS, { timeout: 5000 });
    const breadcrumbs = await page.$$eval(SELECTORS.PRODUCT.BREADCRUMBS, anchors =>
      anchors.map(a => a.textContent.trim().replace(/,/g, ';')).join(',')
    );
    console.log('✅ Breadcrumbs extracted.');
    return breadcrumbs;
  } catch {
    console.log('⚠️ Breadcrumbs not found.');
    return '';
  }
}

export async function extractDescription(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_BUTTON, { timeout: 5000 });
    await page.click(SELECTORS.PRODUCT.DESCRIPTION_BUTTON);
    await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, { timeout: 5000 });
    const desc = await page.$eval(SELECTORS.PRODUCT.DESCRIPTION_CONTENT, el => el.textContent.trim());
    console.log('✅ Description extracted.');
    return desc;
  } catch {
    console.log('⚠️ Description not found.');
    return '';
  }
}

// export async function getColorVariants(page) {
//   try {
//     await page.waitForSelector(SELECTORS.PRODUCT.COLOR_OPTIONS, { timeout: 5000 });
//     const colorOptions = await page.$$eval(SELECTORS.PRODUCT.COLOR_OPTIONS, options =>
//       options.map(option => ({
//         label: option.querySelector('input[type="radio"]')?.getAttribute('aria-label')?.replace('Color: ', '') || '',
//         id: option.querySelector('input[type="radio"]')?.id || ''
//       })).filter(c => c.label)
//     );

//     const colorElements = [];
//     for (const color of colorOptions) {
//       const elementHandle = await page.$(`input#${color.id}`);
//       if (elementHandle) {
//         colorElements.push({ element: elementHandle, label: color.label });
//       }
//     }

//     console.log(`✅ Found ${colorElements.length} color variants.`);
//     return colorElements;
//   } catch {
//     console.log('ℹ️ No color variants found.');
//     return [];
//   }
// }

// export async function getSizeVariants(page) {
//   try {
//     await page.waitForSelector(SELECTORS.PRODUCT.SIZE_OPTIONS, { timeout: 5000 });
//     const sizes = await page.$$eval(SELECTORS.PRODUCT.SIZE_OPTIONS, options =>
//       options.map(option => 
//         option.querySelector('span.label.updated-label.margin-left-xxxs')?.textContent.trim()
//       ).filter(Boolean)
//     );
//     console.log(`✅ Found ${sizes.length} size variants.`);
//     return sizes;
//   } catch {
//     console.log('ℹ️ No size variants found.');
//     return [];
//   }
// }
