// helpers/constants.js
export const SELECTORS = {
  PRODUCT: {
    // Title
    TITLE_BRAND: "h1.product-title a", // Brand name from h1
    TITLE_NAME: "h1.product-title span", // Product name from h1

    // Image - UPDATED
    MAIN_IMAGE: 'div.picture-container picture img', // Targets img tag within a picture tag

    // Price - UPDATED for "Cost per item" (which seems to be the original strike-through price)
    // The user specified 'class="body-regular price-strike"' for "cost per item"
    // This is typically the original price, not the wholesale cost.
    // I'm naming it ORIGINAL_OR_STRIKE_PRICE to reflect its likely purpose on a public site.
    ORIGINAL_OR_STRIKE_PRICE: '.body-regular.price-strike',
    // Description & Features
    DESCRIPTION_BUTTON: 'button.switch.link-med',
    DESCRIPTION_CONTENT_CONTAINER: 'div#details-drawer',
    DESCRIPTION_MAIN_PARAGRAPH: 'div#details-drawer p',
    DESCRIPTION_LIST_ITEMS: 'div#details-drawer ul > li.column',
    FEATURES_SECTION: 'section[data-auto="product-details-section-features"]',
    SHIPPING_RETURNS_SECTION: 'section[data-auto="product-details-section-shipping"]',

    // Variants (Colors & Sizes) - UPDATED
    // IMPORTANT: 'span data-testid="selected-color-name"' and 'span id="selection-tile-..."'
    // are likely for *displaying* the currently selected variant, not for *clicking* to select variants.
    // I will use more common selectors for *clickable elements* for iteration,
    // and note the ones you provided if they are for getting the *value* of the selected item.
   // Variants (Colors & Sizes) - UPDATED BASED ON YOUR HTML & LIVE PAGE INSPECTION
    COLOR_OPTION_NAME: 'span.updated-label.label', // Still seems correct for the option name itself
    // Corrected: Target the clickable label or a div with data-testid that is the clickable swatch
    COLOR_RADIO_LABELS: 'label.color-swatch-item[data-testid="color-swatch-label"], .color-swatches .color-swatch-item',
    SELECTED_COLOR_VALUE_DISPLAY: 'span[data-testid="selected-color-name"]', // This looks correct

    SIZE_OPTION_NAME: 'span.updated-label.label', // Still seems correct for the option name itself
    // Corrected: Target the clickable label for sizes
    SIZE_RADIO_LABELS: 'label.size-tile.selection-tile',
    // Corrected: Target the display span for selected size value
    SELECTED_SIZE_VALUE_DISPLAY: 'span[data-auto="size-picker-selected-value"], span.label.updated-label.margin-left-xxxs',
  
  },
  BREADCRUMBS: {
    LINKS: 'ol.p-breadcrumb-list > li.p-menuitem > a',
  },
};

// Define the rate for calculating variant price from the cost per item (displayed original price)
export const VARIANT_PRICE_RATE = 1.5; // Example: 50% markup. ADJUST THIS AS NEEDED!