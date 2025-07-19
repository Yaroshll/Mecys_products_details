// helpers/constants.js

export const SELECTORS = {
  PRODUCT: {
    TITLE_BRAND: 'h1 [data-auto="product-brand-name"], h1 .brand-name',
    TITLE_NAME: 'h1 [data-auto="product-name"], h1 .product-name',
    ORIGINAL_OR_STRIKE_PRICE: '.price-original, .price-discount, .strike-through-price',
    CURRENT_PRICE: '.price-current, .product-price-primary',
    MAIN_IMAGE: '.main-image-container img[src], .main-image-container img[data-src]',
    DESCRIPTION_BUTTON: 'button[aria-controls="product-details-description"], [data-auto="product-description-button"]',
    DESCRIPTION_CONTENT_CONTAINER: '#product-details-description-content, .product-details-tab-content',
    DESCRIPTION_MAIN_PARAGRAPH: '#product-details-description-content > p, .product-description-text',
    DESCRIPTION_LIST_ITEMS: '#product-details-description-content ul li, .product-description-list li',
    FEATURES_SECTION: '[data-auto="product-features-section"], .product-features',
    SHIPPING_RETURNS_SECTION: '[data-auto="product-shipping-returns-section"], .shipping-returns',
  },
  BREADCRUMBS: {
    LINKS: '.breadcrumbs-container a, .breadcrumb-item a',
  },
  VARIANTS: {
    CONTAINER: 'div[data-module-type="ProductDetailVariationSelector"] > div.h-margin-a-module-gap > div, .product-variants-container > div',
    TITLE: 'div:nth-child(1) > span, .variant-selector__label, .product-attribute-label',
    ITEMS: 'div > ul > li > a, .color-swatch-tile, .selection-tile, label.radio-option',
  },
};

// --- Add this line ---
export const VARIANT_PRICE_RATE = 0.8; // Example: Set your desired rate here
// --------------------