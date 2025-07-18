// helpers/extractors.js
import { 
  calculatePrices, 
  extractSKU, 
  formatHandleFromUrl, 
} from "./formatters.js";
import { gotoMacyWithRetries } from "./gotoWithRetries.js";
import { SELECTORS, VARIANT_PRICE_RATE } from './constants.js';

async function safeClick(element, timeout = 10000) {
  try {
    await element.click({ timeout });
  } catch (error) {
    console.warn('Standard click failed, trying JS click...');
    await element.evaluate(el => el.click());
  }
}

export async function extractTitle(page) {
  let brand = "";
  let productName = "";
  let title = "";

  try {
    brand = await page.$eval(SELECTORS.PRODUCT.TITLE_BRAND, (el) =>
      el.textContent.trim()
    ).catch(() => "");
  } catch (error) {
    console.warn("⚠️ Could not extract brand name:", error.message);
  }

  try {
    productName = await page.$eval(SELECTORS.PRODUCT.TITLE_NAME, (el) =>
      el.textContent.trim()
    ).catch(() => "");
  } catch (error) {
    console.warn("⚠️ Could not extract product name:", error.message);
  }

  if (brand && productName) {
    title = `${brand}, ${productName}`;
  } else if (brand) {
    title = brand;
  } else if (productName) {
    title = productName;
  }

  return { brand, productName, title };
}

export async function extractDisplayedCostPerItem(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, { 
      state: 'visible', 
      timeout: 10000 
    });
    return await page.$eval(SELECTORS.PRODUCT.ORIGINAL_OR_STRIKE_PRICE, el => el.textContent.trim());
  } catch (error) {
    console.warn("⚠️ Could not extract displayed cost per item:", error.message);
    return "";
  }
}

export async function extractMainImage(page) {
  try {
    await page.waitForSelector(SELECTORS.PRODUCT.MAIN_IMAGE, { 
      state: 'visible', 
      timeout: 5000 
    });
    return await page.$eval(SELECTORS.PRODUCT.MAIN_IMAGE, (img) => img.src);
  } catch (error) {
    console.warn("⚠️ Could not extract main image:", error.message);
    return "";
  }
}

export async function extractBreadcrumbs(page) {
  try {
    await page.waitForSelector(SELECTORS.BREADCRUMBS.LINKS, { 
      state: 'visible', 
      timeout: 15000 
    });

    return await page.$$eval(
      SELECTORS.BREADCRUMBS.LINKS,
      (anchors) => {
        return anchors
          .map((a) => {
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(a.cloneNode(true));
            tempDiv.querySelectorAll('svg, .separator-icon').forEach(el => el.remove());
            return tempDiv.textContent.trim();
          })
          .filter(text => text && text.toLowerCase() !== 'home')
          .join(",");
      }
    );
  } catch (error) {
    console.warn("⚠️ Could not extract breadcrumbs:", error.message);
    return "";
  }
}

export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    const descriptionButton = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first();
    if (descriptionButton && await descriptionButton.isVisible()) {
      await safeClick(descriptionButton);
      await page.waitForTimeout(1000);
    }

    // Main description
    try {
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { 
        state: 'visible', 
        timeout: 5000 
      });
      const mainDescriptionEl = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
      if (mainDescriptionEl) {
        fullDescriptionHtml += await mainDescriptionEl.evaluate(el => el.outerHTML);
      }
    } catch (error) {
      console.warn("⚠️ Could not extract main description:", error.message);
    }

    // Features list
    try {
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        const itemsToExtract = listItems.slice(0, -1);
        let listHtml = '<ul>';
        for (const item of itemsToExtract) {
          listHtml += await item.evaluate(el => el.outerHTML);
        }
        listHtml += '</ul>';
        fullDescriptionHtml += listHtml;
      }
    } catch (error) {
      console.warn("⚠️ Could not extract list items:", error.message);
    }

    // Features section
    try {
      const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
      if (featuresSection) {
        fullDescriptionHtml += await featuresSection.evaluate(el => el.outerHTML);
      }
    } catch (error) {
      console.warn("⚠️ Could not extract features:", error.message);
    }

    // Shipping section
    try {
      const shippingSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
      if (shippingSection) {
        fullDescriptionHtml += await shippingSection.evaluate(el => el.outerHTML);
      }
    } catch (error) {
      console.warn("⚠️ Could not extract shipping info:", error.message);
    }

  } catch (error) {
    console.error("❌ Error in extractFullDescription:", error.message);
  }
  return fullDescriptionHtml.trim();
}

export async function waitForImageChangeCheck({ page, anchorToClick }) {
  const oldMainImage = await extractMainImage(page);
  if (anchorToClick) {
    await anchorToClick.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }

  await safeClick(anchorToClick);
  console.log("Waiting for image change...");
  
  try {
    await page.waitForFunction(
      (prevMainImage, selector) => {
        const currMainImage = document.querySelector(selector)?.src;
        return currMainImage && currMainImage !== prevMainImage;
      },
      oldMainImage,
      SELECTORS.PRODUCT.MAIN_IMAGE,
      { timeout: 10000 }
    );
  } catch (err) {
    console.warn("⚠️ Image did not change:", err.message);
  }
  await page.waitForTimeout(1000);
}

export async function extractMacyProductData(page, url, extraTags) {
  const allShopifyRows = [];

  try {
    await gotoMacyWithRetries(page, url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const handle = formatHandleFromUrl(url);
    const { brand, productName, title } = await extractTitle(page);
    const descriptionHtml = await extractFullDescription(page);
    const breadcrumbs = await extractBreadcrumbs(page);

    const finalProductTags = [
      ...new Set([
        ...breadcrumbs.split(",").map(tag => tag.trim()),
        ...(extraTags ? extraTags.split(", ").map(tag => tag.trim()) : []),
      ]),
    ].filter(Boolean).join(", ");

    // Determine variant option names
    let option1Name = "Color";
    let option2Name = "Size";
    
    try {
      const colorOptionNameEl = await page.$(SELECTORS.PRODUCT.COLOR_OPTION_NAME);
      if (colorOptionNameEl) {
        option1Name = (await colorOptionNameEl.textContent()).replace(':', '').trim();
      }
    } catch (error) {
      console.warn("⚠️ Could not get color option name");
    }

    try {
      const sizeOptionNameEl = await page.$(SELECTORS.PRODUCT.SIZE_OPTION_NAME);
      if (sizeOptionNameEl) {
        option2Name = (await sizeOptionNameEl.textContent()).replace(':', '').trim();
      }
    } catch (error) {
      console.warn("⚠️ Could not get size option name");
    }

    // Handle variants
    let colorSwatchLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
    let sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

    if (colorSwatchLabels.length > 0) {
      console.log(`Found ${colorSwatchLabels.length} color variants`);

      for (let i = 0; i < colorSwatchLabels.length; i++) {
        const currentColorLabels = await page.$$(SELECTORS.PRODUCT.COLOR_RADIO_LABELS);
        const colorLabel = currentColorLabels[i];
        if (!colorLabel) continue;

        const isColorSelected = await colorLabel.evaluate(el => 
          el.querySelector('input[type="radio"]:checked') !== null || 
          el.classList.contains('selected')
        );

        if (!isColorSelected) {
          console.log(`Selecting color ${i + 1}/${colorSwatchLabels.length}`);
          await waitForImageChangeCheck({ page, anchorToClick: colorLabel });
          await page.waitForTimeout(1500);
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_COLOR_VALUE_DISPLAY, el => el.textContent.trim())
                              .catch(() => colorLabel.evaluate(el => 
                                el.querySelector('img')?.alt || 
                                el.ariaLabel?.replace('Color: ', '').trim() || 
                                el.textContent.trim()));

        const mainImage = await extractMainImage(page);
        sizeChipLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);

        if (sizeChipLabels.length > 0) {
          console.log(`Found ${sizeChipLabels.length} sizes for color "${currentOption1Value}"`);

          for (let j = 0; j < sizeChipLabels.length; j++) {
            const currentSizeLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
            const sizeLabel = currentSizeLabels[j];
            if (!sizeLabel) continue;

            const isSizeSelected = await sizeLabel.evaluate(el => 
              el.querySelector('input[type="radio"]:checked') !== null || 
              el.classList.contains('selected')
            );

            if (!isSizeSelected) {
              console.log(`Selecting size ${j + 1}/${sizeChipLabels.length}`);
              await safeClick(sizeLabel);
              await page.waitForTimeout(1000);
            }

            let currentOption2Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                                  .catch(() => sizeLabel.evaluate(el => el.textContent.trim()));

            const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
            const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

            allShopifyRows.push(createShopifyRow({
              handle,
              title: allShopifyRows.length === 0 ? title : "",
              descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
              tags: allShopifyRows.length === 0 ? finalProductTags : "",
              option1Name,
              option1Value: currentOption1Value,
              option2Name,
              option2Value: currentOption2Value,
              variantPrice,
              costPerItem,
              mainImage,
              imageAltText: `${title} - ${currentOption1Value} ${currentOption2Value}`,
              url
            }));
          }
        } else {
          // No sizes, just colors
          const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
          const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

          allShopifyRows.push(createShopifyRow({
            handle,
            title: allShopifyRows.length === 0 ? title : "",
            descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
            tags: allShopifyRows.length === 0 ? finalProductTags : "",
            option1Name,
            option1Value: currentOption1Value,
            variantPrice,
            costPerItem,
            mainImage,
            imageAltText: `${title} - ${currentOption1Value}`,
            url
          }));
        }
      }
    } else if (sizeChipLabels.length > 0) {
      // Only sizes, no colors
      console.log(`Found ${sizeChipLabels.length} size variants`);
      option1Name = "Size";

      for (let i = 0; i < sizeChipLabels.length; i++) {
        const currentSizeLabels = await page.$$(SELECTORS.PRODUCT.SIZE_RADIO_LABELS);
        const sizeLabel = currentSizeLabels[i];
        if (!sizeLabel) continue;

        const isSizeSelected = await sizeLabel.evaluate(el => 
          el.querySelector('input[type="radio"]:checked') !== null || 
          el.classList.contains('selected')
        );

        if (!isSizeSelected) {
          console.log(`Selecting size ${i + 1}/${sizeChipLabels.length}`);
          await safeClick(sizeLabel);
          await page.waitForTimeout(1000);
        }

        let currentOption1Value = await page.$eval(SELECTORS.PRODUCT.SELECTED_SIZE_VALUE_DISPLAY, el => el.textContent.trim())
                              .catch(() => sizeLabel.evaluate(el => el.textContent.trim()));

        const mainImage = await extractMainImage(page);
        const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
        const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

        allShopifyRows.push(createShopifyRow({
          handle,
          title: allShopifyRows.length === 0 ? title : "",
          descriptionHtml: allShopifyRows.length === 0 ? descriptionHtml : "",
          tags: allShopifyRows.length === 0 ? finalProductTags : "",
          option1Name,
          option1Value: currentOption1Value,
          variantPrice,
          costPerItem,
          mainImage,
          imageAltText: `${title} - ${currentOption1Value}`,
          url
        }));
      }
    } else {
      // No variants
      console.log("No variants found");
      const mainImage = await extractMainImage(page);
      const displayedCostPerItemText = await extractDisplayedCostPerItem(page);
      const { costPerItem, variantPrice } = calculatePrices(displayedCostPerItemText);

      allShopifyRows.push(createShopifyRow({
        handle,
        title,
        descriptionHtml,
        tags: finalProductTags,
        variantPrice,
        costPerItem,
        mainImage,
        imageAltText: title,
        url
      }));
    }

    return allShopifyRows;
  } catch (error) {
    console.error(`❌ Error processing ${url}:`, error);
    throw error;
  }
}

function createShopifyRow({
  handle,
  title,
  descriptionHtml,
  tags,
  option1Name = "",
  option1Value = "",
  option2Name = "",
  option2Value = "",
  variantPrice,
  costPerItem,
  mainImage,
  imageAltText,
  url
}) {
  return {
    "Handle": handle,
    "Title": title,
    "Body (HTML)": descriptionHtml,
    "Vendor": "Macy's",
    "Type": "Footwear",
    "Tags": tags,
    "Published": "TRUE",
    "Option1 Name": option1Name,
    "Option1 Value": option1Value,
    "Option2 Name": option2Name,
    "Option2 Value": option2Value,
    "Option3 Name": "",
    "Option3 Value": "",
    "Variant SKU": extractSKU(url),
    "Variant Grams": "",
    "Variant Price": variantPrice,
    "Cost per item": costPerItem,
    "Variant Taxable": "TRUE",
    "Variant Barcode": "",
    "Image Src": mainImage,
    "Image Position": 1,
    "Image Alt Text": imageAltText,
    "Gift Card": "FALSE",
    "Google Shopping / Condition": "New",
    "Variant Image": mainImage,
    "Variant Weight Unit": "oz",
    "Price": variantPrice,
    "original_product_url": url,
    // ... include other Shopify fields as needed
  };
}