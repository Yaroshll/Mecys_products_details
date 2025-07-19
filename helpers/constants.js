// helpers/constants.js

export const SELECTORS = {
  PRODUCT: {
    TITLE_BRAND: 'h1 [data-auto="product-brand-name"], h1 .brand-name', // Example selector for brand name
    TITLE_NAME: 'h1 [data-auto="product-name"], h1 .product-name', // Example selector for product name
    ORIGINAL_OR_STRIKE_PRICE: '.price-original, .price-discount, .strike-through-price', // Selector for original or sale price
    CURRENT_PRICE: '.price-current, .product-price-primary', // Selector for current selling price
    MAIN_IMAGE: '.main-image-container img[src], .main-image-container img[data-src]', // Main product image
    DESCRIPTION_BUTTON: 'button[aria-controls="product-details-description"], [data-auto="product-description-button"]', // Button to expand description
    DESCRIPTION_CONTENT_CONTAINER: '#product-details-description-content, .product-details-tab-content', // Container for the description
    DESCRIPTION_MAIN_PARAGRAPH: '#product-details-description-content > p, .product-description-text', // Main paragraph in description
    DESCRIPTION_LIST_ITEMS: '#product-details-description-content ul li, .product-description-list li', // List items in description
    FEATURES_SECTION: '[data-auto="product-features-section"], .product-features', // Section for product features
    SHIPPING_RETURNS_SECTION: '[data-auto="product-shipping-returns-section"], .shipping-returns', // Section for shipping info
    // Removed specific color/size radio labels as they are now handled by VARIANTS.ITEMS
    // Removed SELECTED_COLOR_VALUE_DISPLAY and SELECTED_SIZE_VALUE_DISPLAY as extractLabel is more generic
  },
  BREADCRUMBS: {
    LINKS: '.breadcrumbs-container a, .breadcrumb-item a', // Breadcrumb links
  },
  VARIANTS: {
    // This is crucial: a generic container for ALL variant sections (e.g., Color, Size, Size Group)
    // You might need to inspect the HTML to find a common parent div that holds all variant selectors.
    // Example: div containing multiple sections like <div data-variant-type="color">, <div data-variant-type="size">
    CONTAINER: 'div[data-module-type="ProductDetailVariationSelector"] > div.h-margin-a-module-gap > div, .product-variants-container > div',
    // The title within each variant section (e.g., "Color:", "Size:", "Size Group:")
    TITLE: 'div:nth-child(1) > span, .variant-selector__label, .product-attribute-label',
    // The actual clickable variant items (swatches/chips) within each section
    // These should be the `a` tags or `label` tags that you click.
    ITEMS: 'div > ul > li > a, .color-swatch-tile, .selection-tile, label.radio-option',
  },
};