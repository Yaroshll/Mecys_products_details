import { launchBrowser } from "./helpers/browser.js";
import { extractProductData } from "./helpers/extractors.js";
import { saveToCSVAndExcel } from "./helpers/fileIO.js";

const urls = [
  "https://www.macys.com/shop/product/jessica-simpson-olivine-bow-high-heel-stiletto-dress-sandals?ID=19766033"
];

const allRows = [];

const browser = await launchBrowser();
const context = await browser.newContext();
const page = await context.newPage();

for (const url of urls) {
  try {
    console.info(`🔎 Scraping: ${url}`);
    const data = await extractProductData(page, url);
    const { handle, title, breadcrumbs, mainImage, price, originalPrice, color, description, variants } = data;

    const { variantPrice, compareAtPrice } = calculatePrices(price);
    const productTags = breadcrumbs.join(", ");

    if (variants.length) {
      variants.forEach((variant, index) => {
        allRows.push({
          Handle: handle,
          Title: index === 0 ? title : '',
          "Body (HTML)": index === 0 ? description : '',
          "Variant SKU": '',
          "Option1 Name": "Color",
          "Option1 Value": variant?.Color || color || '',
          "Option2 Name": "Size",
          "Option2 Value": variant?.Size || '',
          "Cost per item": price,
          "Variant Price": variantPrice,
          "Compare At Price": compareAtPrice,
          "Variant Image": variant?.mainImage || mainImage,
          "Image Src": index === 0 ? mainImage : '',
          "Variant Fulfillment Service": "manual",
          "Variant Inventory Policy": "deny",
          "Variant Inventory Tracker": "shopify",
          Type: index === 0 ? "USA Products" : '',
          Vendor: index === 0 ? "Macy's" : '',
          Tags: index === 0 ? productTags : '',
          original_product_url: index === 0 ? url : '',
        });
      });
    } else {
      allRows.push({
        Handle: handle,
        Title: title,
        "Body (HTML)": description,
        "Variant SKU": '',
        "Option1 Name": "Color",
        "Option1 Value": color || '',
        "Option2 Name": "Size",
        "Option2 Value": '',
        "Cost per item": price,
        "Variant Price": variantPrice,
        "Compare At Price": compareAtPrice,
        "Variant Image": mainImage,
        "Image Src": mainImage,
        "Variant Fulfillment Service": "manual",
        "Variant Inventory Policy": "deny",
        "Variant Inventory Tracker": "shopify",
        Type: "USA Products",
        Vendor: "Macy's",
        Tags: productTags,
        original_product_url: url,
      });
    }

    console.info(`✅ Scraped successfully: ${url}`);
  } catch (err) {
    console.error(`❌ Error scraping: ${url} - ${err.message}`);
  }
}

await browser.close();

saveToCSVAndExcel(allRows);
