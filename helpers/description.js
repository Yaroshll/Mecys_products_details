export async function extractFullDescription(page) {
  let fullDescriptionHtml = "";
  try {
    // --- Step 1: Click the description/details button if it exists ---
    // Wait for the new button selector
    const descriptionButton = await page.locator(SELECTORS.PRODUCT.DESCRIPTION_BUTTON).first(); // Use locator and .first()
    if (descriptionButton && await descriptionButton.isVisible()) {
      console.log("Clicking description/details button...");
      await descriptionButton.click();
      await page.waitForTimeout(1000); // Give time for content to expand/load
    } else {
        console.log("Description button not found or not visible, proceeding without click.");
    }

    // --- Step 2: Extract the main product description paragraph ---
    try {
      // Wait for the main content container to be visible
      await page.waitForSelector(SELECTORS.PRODUCT.DESCRIPTION_CONTENT_CONTAINER, { state: 'visible', timeout: 5000 });
      const mainDescriptionEl = await page.$(SELECTORS.PRODUCT.DESCRIPTION_MAIN_PARAGRAPH);
      if (mainDescriptionEl) {
        fullDescriptionHtml += await mainDescriptionEl.evaluate(el => el.outerHTML);
        console.log("Extracted main description paragraph.");
      } else {
        console.warn("⚠️ Main description paragraph not found within container.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract main description content:", error.message);
    }

    // --- Step 3: Extract ul > li.column elements, excluding the last child ---
    try {
      const listItems = await page.$$(SELECTORS.PRODUCT.DESCRIPTION_LIST_ITEMS);
      if (listItems.length > 0) {
        // Exclude the last child
        const itemsToExtract = listItems.slice(0, listItems.length - 1);
        let listHtml = '<ul>';
        for (const item of itemsToExtract) {
          listHtml += await item.evaluate(el => el.outerHTML);
        }
        listHtml += '</ul>';
        fullDescriptionHtml += listHtml;
        console.log(`Extracted ${itemsToExtract.length} list items (excluding the last one).`);
      } else {
        console.log("No specific list items (ul > li.column) found for description.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract list items:", error.message);
    }

    // --- Step 4: Extract Features section (if still relevant) ---
    try {
      const featuresSection = await page.$(SELECTORS.PRODUCT.FEATURES_SECTION);
      if (featuresSection && await featuresSection.isVisible()) {
        const featuresHtml = await featuresSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += featuresHtml;
        console.log("Extracted features section.");
      } else {
        console.log("Features section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract features section:", error.message);
    }

    // --- Step 5: Extract Shipping & Returns section (if still relevant) ---
    try {
      const shippingReturnsSection = await page.$(SELECTORS.PRODUCT.SHIPPING_RETURNS_SECTION);
      if (shippingReturnsSection && await shippingReturnsSection.isVisible()) {
        const shippingReturnsHtml = await shippingReturnsSection.evaluate(el => el.outerHTML);
        fullDescriptionHtml += shippingReturnsHtml;
        console.log("Extracted shipping & returns section.");
      } else {
        console.log("Shipping & Returns section not found or not visible.");
      }
    } catch (error) {
      console.warn("⚠️ Could not extract shipping & returns section:", error.message);
    }

  } catch (error) {
    console.error("❌ Error in extractFullDescription:", error.message);
  }
  return fullDescriptionHtml.trim();
}
