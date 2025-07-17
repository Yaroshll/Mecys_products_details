import { launchBrowser } from './helpers/browser.js';
import { 
  extractTitle,
  extractPrice,
  extractMainImage,
  extractBreadcrumbs,
  extractDescription,
  getColorVariants,
  getSizeVariants
} from './helpers/extractors.js';
import { saveToCSV } from './helpers/fileIO.js';
import { formatHandleFromUrl, calculateVariantPrice } from './helpers/formatters.js';

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  const urls = [
    'https://www.macys.com/shop/product/jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals?ID=19766033'
    // Add more URLs here
  ];

  const allProducts = [];
  let successCount = 0;

  console.log(`Starting to process ${urls.length} URLs...`);

  for (const url of urls) {
    try {
      console.log(`Processing: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Extract basic info
      const handle = formatHandleFromUrl(url);
      const title = await extractTitle(page);
      const costPerItem = await extractPrice(page);
      const variantPrice = calculateVariantPrice(costPerItem);
      const mainImage = await extractMainImage(page);
      const tags = await extractBreadcrumbs(page);
      const description = await extractDescription(page);

      // Handle variants
      const colorVariants = await getColorVariants(page);
      const sizeVariants = await getSizeVariants(page);

      if (colorVariants.length === 0 && sizeVariants.length === 0) {
        // No variants case
        allProducts.push(createProductRow({
          handle, title, description, tags, url,
          costPerItem, variantPrice, mainImage
        }));
        successCount++;
        console.log(`✅ Success (no variants): ${url} (${successCount}/${urls.length})`);
      } 
      else if (colorVariants.length > 0 && sizeVariants.length > 0) {
        // Both color and size variants
        for (const color of colorVariants) {
          await color.element.click();
          await page.waitForTimeout(1000);
          
          const colorImage = await extractMainImage(page);
          const currentPrice = await extractPrice(page);
          const currentVariantPrice = calculateVariantPrice(currentPrice);
          
          for (const size of sizeVariants) {
            allProducts.push(createProductRow({
              handle, title, description, tags, url,
              costPerItem: currentPrice,
              variantPrice: currentVariantPrice,
              mainImage: colorImage,
              option1Name: 'Color',
              option1Value: color.label,
              option2Name: 'Size',
              option2Value: size
            }));
          }
        }
        successCount++;
        console.log(`✅ Success (color+size variants): ${url} (${successCount}/${urls.length})`);
      }
      else if (colorVariants.length > 0) {
        // Only color variants
        for (const color of colorVariants) {
          await color.element.click();
          await page.waitForTimeout(1000);
          
          const colorImage = await extractMainImage(page);
          const currentPrice = await extractPrice(page);
          const currentVariantPrice = calculateVariantPrice(currentPrice);
          
          allProducts.push(createProductRow({
            handle, title, description, tags, url,
            costPerItem: currentPrice,
            variantPrice: currentVariantPrice,
            mainImage: colorImage,
            option1Name: 'Color',
            option1Value: color.label
          }));
        }
        successCount++;
        console.log(`✅ Success (color variants only): ${url} (${successCount}/${urls.length})`);
      }
      else if (sizeVariants.length > 0) {
        // Only size variants
        for (const size of sizeVariants) {
          allProducts.push(createProductRow({
            handle, title, description, tags, url,
            costPerItem, variantPrice, mainImage,
            option1Name: 'Size',
            option1Value: size
          }));
        }
        successCount++;
        console.log(`✅ Success (size variants only): ${url} (${successCount}/${urls.length})`);
      }

    } catch (error) {
      console.error(`❌ Failed: ${url} - ${error.message}`);
    }
  }

  await browser.close();
  
  if (allProducts.length > 0) {
    saveToCSV(allProducts);
    console.log(`\nFinished! Successfully processed ${successCount}/${urls.length} URLs.`);
    console.log(`Saved ${allProducts.length} product variants to output/products.csv`);
  } else {
    console.log('No products were scraped successfully.');
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
    'Vendor': 'Macy\'s',
    'Tags': tags,
    'original_product_url': url
  };
}