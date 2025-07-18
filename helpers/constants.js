// helpers/constants.js (After)
export const SELECTORS = {
  PRODUCT: {
    TITLE_BRAND: "h1.product-title a", // Brand name from h1
    TITLE_NAME: "h1.product-title span", // Product name from h1
    PRICE_WRAPPER: "div.price-wrapper", // Wrapper for price information
    MAIN_IMAGE: 'div.picture-container img[src*="is/image"]', // Main product image
    COLOR_SWATCHES_CONTAINER: "div.color-swatches", // Container for color variants
    COLOR_OPTION_NAME: "div.flex-container.align-justify > span:nth-child(1)", // Option name for colors (e.g., "Color:")
    COLOR_OPTION_VALUE: "div.flex-container.align-justify > span:nth-child(2)", // Option value for colors (e.g., "Gold Soft Metallic")
    COLOR_RADIO_LABELS: 'form.colors-form ol > li label.color-swatch-sprite-label', // Clickable color labels
    SIZE_CHIPS_CONTAINER: 'div[data-testid="size-chips"]', // Container for size variants
    SIZE_OPTION_NAME: 'div[data-testid="size-chips"] > div.margin-bottom-xs.grid-x span[data-testid="size-label"]', // Option name for sizes (e.g., "Size:")
    SIZE_OPTION_VALUE: 'div[data-testid="size-chips"] > div.margin-bottom-xs.grid-x span.label.updated-label.margin-left-xxxs', // Option value for sizes
    SIZE_RADIO_LABELS: 'fieldset[data-testid="size-chips"] div.cell.shrink label.label', // Clickable size labels
    DESCRIPTION_BUTTON: 'button.switch.link-med', // Button to reveal description
    DESCRIPTION_CONTENT: 'div#details-drawer > div > p', // Main product description
    FEATURES_SECTION: 'ul[data-v-4668fb90] > li[data-auto="product-summary-section"]', // Features section
    SHIPPING_RETURNS_SECTION: 'ul[data-v-4668fb90] > li[data-auto="shipping-returns-section"]', // Shipping & Returns section
  },
  BREADCRUMBS: {
    LINKS: 'ol.breadcrumbs-list li.p-menuitem > a', // Breadcrumb links
  },
};

export const EXCHANGE_RATE = 3.675;
export const VARIANT_PRICE_RATE = 1.3; // Corrected typo in variable name