// helpers/constants.js
export const SELECTORS = {
  PRODUCT: {
    // Title
    TITLE_BRAND: "h1.product-title a", // Brand name from h1
    TITLE_NAME: "h1.product-title span", // Product name from h1

    // Image - UPDATED
    MAIN_IMAGE: 'img.picture-image', // Targets img tag within a picture tag

    // Price - UPDATED for "Cost per item" (which seems to be the original strike-through price)
    // The user specified 'class="body-regular price-strike"' for "cost per item"
    // This is typically the original price, not the wholesale cost.
    // I'm naming it ORIGINAL_OR_STRIKE_PRICE to reflect its likely purpose on a public site.
    ORIGINAL_OR_STRIKE_PRICE: '.body-regular.price-strike',
    // You might still have a current/sale price selector if you want to extract it separately
    CURRENT_PRICE: '.price-info .current-price, .price-info .sale-price', // Example for current/sale price

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
    COLOR_OPTION_NAME: 'span.updated-label.label', // This appears to be the generic label for the option name
    // For clickable color swatches, usually a label or div wrapping a radio input
    COLOR_RADIO_LABELS: '.color-swatches .color-swatch-item label, .color-swatches [data-auto="color-swatch-label"]', // More general selectors for clickable elements.
    // The user provided `span data-testid="selected-color-name"` which is likely the display of the *selected* color value.
    SELECTED_COLOR_VALUE_DISPLAY: 'span[data-testid="selected-color-name"]', // For extracting the value of the currently selected color

    SIZE_OPTION_NAME: 'span.updated-label.label', // This appears to be the generic label for the option name
    // For clickable size chips, usually a label or div wrapping a radio input
    SIZE_RADIO_LABELS: '.size-selector .size-chip-item label, .size-selector [data-auto="size-tile-label"]', // More general selectors for clickable elements.
    // The user provided `span id="selection-tile-5036768-1"` which is too specific.
    // This is likely the display of the *selected* size value.
    SELECTED_SIZE_VALUE_DISPLAY: '.size-selector span[id^="selection-tile-"]', // For extracting the value of the currently selected size (starts with selection-tile-)
  },
  BREADCRUMBS: {
    LINKS: 'nav[aria-label="breadcrumbs"] a, .breadcrumbs-container a, .breadcrumbs-wrapper a',
  },
};

// Define the rate for calculating variant price from the cost per item (displayed original price)
export const VARIANT_PRICE_RATE = 1.5; // Example: 50% markup. ADJUST THIS AS NEEDED!