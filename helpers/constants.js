
// helpers/constants.js
export const SELECTORS = {
  PRODUCT: {
    // Title
    TITLE_BRAND: 'h1.pdp-title span.brand', // Selector for the brand name
    TITLE_NAME: 'h1.pdp-title span.product-name', // Selector for the product name

    // Price
    PRICE_WRAPPER: '.price-info', // A common parent for price elements
    SALE_PRICE: '.price-info .sale-price', // Selector for sale price (if applicable)
    ORIGINAL_PRICE: '.price-info .original-price', // Selector for original price (if applicable)

    // Image
    MAIN_IMAGE: '.main-image-component img', // Selector for the main product image

    // Description & Features
    DESCRIPTION_BUTTON: 'button[id*="description-header"], button[aria-controls*="product-details-content"]', // Common buttons to expand description
    DESCRIPTION_CONTENT: '.product-details-section #product-details-content', // Main description container after expanding
    FEATURES_SECTION: 'section[data-auto="product-details-section-features"]', // Selector for the features section
    SHIPPING_RETURNS_SECTION: 'section[data-auto="product-details-section-shipping"]', // Selector for shipping & returns

    // Variants (Colors & Sizes)
    COLOR_OPTION_NAME: 'legend:has-text("Color"), .color-swatches legend', // Selector for the text "Color"
    COLOR_RADIO_LABELS: '.color-swatches .color-swatch-item label', // Labels for color radio buttons (clickable elements)

    SIZE_OPTION_NAME: 'legend:has-text("Size"), .size-selector legend', // Selector for the text "Size"
    SIZE_RADIO_LABELS: '.size-selector .size-chip-item label', // Labels for size radio buttons/chips (clickable elements)
  
},
  BREADCRUMBS: {
    LINKS: 'nav[aria-label="breadcrumbs"] a, .breadcrumbs-container a, .breadcrumbs-wrapper a',
   // Breadcrumb links
  },
};

export const EXCHANGE_RATE = 3.675;
export const VARIANT_PRICE_RATE = 1.3; // Corrected typo in variable name