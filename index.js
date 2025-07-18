import { launchBrowser } from './helpers/browser.js';
import {
  extractTitle,
  extractPrice,
  extractMainImage,
  extractBreadcrumbs,
  extractDescription,
  //getColorVariants,
 // getSizeVariants
} from './helpers/extractors.js';
import { saveToCSV } from './helpers/fileIO.js';
import { formatHandleFromUrl, calculateVariantPrice } from './helpers/formatters.js';

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const urls = [
    'https://www.macys.com/shop/product/jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals?ID=19766033'
    // Add more product URLs here
  ];

  const allProducts = [];
  let successCount = 0;

  console.log(`🚀 Starting scraping for ${urls.length} URLs...`);

  for (const [index, url] of urls.entries()) {
    try {
      console.log(`➡️ (${index + 1}/${urls.length}) Processing: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      const title = await extractTitle(page);
      const handle = formatHandleFromUrl(url, title);
      const costPerItem = await extractPrice(page);
      const variantPrice = calculateVariantPrice(costPerItem);
      const mainImage = await extractMainImage(page);
      const tags = await extractBreadcrumbs(page);
      const description = await extractDescription(page);

      console.log('📝 Basic product info extracted.');

      // const colorVariants = await getColorVariants(page);
      // const sizeVariants = await getSizeVariants(page);

      // if (colorVariants.length === 0 && sizeVariants.length === 0) {
      //   console.log('ℹ️ No variants detected. Saving base product.');
      //   allProducts.push(createProductRow({
      //     handle, title, description, tags, url,
      //     costPerItem, variantPrice, mainImage
      //   }));
      // }
      // else if (colorVariants.length > 0 && sizeVariants.length > 0) {
      //   console.log('ℹ️ Color & Size variants found. Looping...');
      //   for (const color of colorVariants) {
      //     await color.element.click();
      //     await page.waitForTimeout(1000);

      //     const colorImage = await extractMainImage(page);
      //     const colorPrice = await extractPrice(page);
      //     const colorVariantPrice = calculateVariantPrice(colorPrice);

      //     // Save color only
      //     allProducts.push(createProductRow({
      //       handle, title, description, tags, url,
      //       costPerItem: colorPrice,
      //       variantPrice: colorVariantPrice,
      //       mainImage: colorImage,
      //       option1Name: 'Color',
      //       option1Value: color.label
      //     }));

      //     // Loop on sizes with current color
      //     for (const size of sizeVariants) {
      //       allProducts.push(createProductRow({
      //         handle, title, description, tags, url,
      //         costPerItem: colorPrice,
      //         variantPrice: colorVariantPrice,
      //         mainImage: colorImage,
      //         option1Name: 'Color',
      //         option1Value: color.label,
      //         option2Name: 'Size',
      //         option2Value: size
      //       }));
      //     }
      //   }
      // }
      // else if (colorVariants.length > 0) {
      //   console.log('ℹ️ Only color variants found. Looping...');
      //   for (const color of colorVariants) {
      //     await color.element.click();
      //     await page.waitForTimeout(1000);

      //     const colorImage = await extractMainImage(page);
      //     const colorPrice = await extractPrice(page);
      //     const colorVariantPrice = calculateVariantPrice(colorPrice);

      //     allProducts.push(createProductRow({
      //       handle, title, description, tags, url,
      //       costPerItem: colorPrice,
      //       variantPrice: colorVariantPrice,
      //       mainImage: colorImage,
      //       option1Name: 'Color',
      //       option1Value: color.label
      //     }));
      //   }
      // }
      // else if (sizeVariants.length > 0) {
      //   console.log('ℹ️ Only size variants found. Looping...');
      //   for (const size of sizeVariants) {
      //     allProducts.push(createProductRow({
      //       handle, title, description, tags, url,
      //       costPerItem,
      //       variantPrice,
      //       mainImage,
      //       option1Name: 'Size',
      //       option1Value: size
      //     }));
      //   }
      // }

      successCount++;
      console.log(`✅ Success (${successCount}/${urls.length}): ${url}`);
    } catch (error) {
      console.error(`❌ Error processing: ${url} - ${error.message}`);
    }
  }

  await browser.close();

  if (allProducts.length > 0) {
    saveToCSV(allProducts);
    console.log(`🎯 Finished successfully. Processed ${successCount} out of ${urls.length} URLs.`);
    console.log(`📁 Saved ${allProducts.length} product rows to output/products.csv`);
  } else {
    console.log('⚠️ No products were scraped.');
  }
})();

function createProductRow({
  handle,
  title,
  description,
  tags,
  url,
  costPerItem,
  variantPrice,
  mainImage,
  option1Name = '',
  option1Value = '',
  option2Name = '',
  option2Value = ''
}) {
  return {
    'Handle': handle,
    'Title': title,
    'Body (HTML)': description,
    'Variant SKU': '',
    'Option1 Name': option1Name,
    'Option1 Value': option1Value,
    'Option2 Name': option2Name,
    'Option2 Value': option2Value,
    'Cost per item': costPerItem,
    'Variant Price': variantPrice,
    'Variant Image': mainImage,
    'Image Src': mainImage,
    'Variant Fulfillment Service': 'manual',
    'Variant Inventory Policy': 'deny',
    'Variant Inventory Tracker': 'shopify',
    'Type': 'USA Products',
    'Vendor': "Macy's",
    'Tags': tags,
    'original_product_url': url
  };
}
