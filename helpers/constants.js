export const SELECTORS = {
  PRODUCT: {
    TITLE_BRAND: "h1.product-title a",
    TITLE_NAME: "h1.product-title span",
    MAIN_IMAGE: 'div.picture-container picture img',
    ORIGINAL_OR_STRIKE_PRICE: '.body-regular.price-strike',
    DESCRIPTION_BUTTON: 'button.switch.link-med',
    DESCRIPTION_CONTENT_CONTAINER: 'div#details-drawer',
    DESCRIPTION_MAIN_PARAGRAPH: 'div#details-drawer p',
    DESCRIPTION_LIST_ITEMS: 'div#details-drawer ul > li.column',
    FEATURES_SECTION: 'section[data-auto="product-details-section-features"]',
    SHIPPING_RETURNS_SECTION: 'section[data-auto="product-details-section-shipping"]',
    COLOR_OPTION_NAME: 'span.updated-label.label',
    COLOR_RADIO_LABELS: 'label.color-swatch-item[data-testid="color-swatch-label"], .color-swatches .color-swatch-item',
    SELECTED_COLOR_VALUE_DISPLAY: 'span[data-testid="selected-color-name"]',
    SIZE_OPTION_NAME: 'span.updated-label.label',
    SIZE_RADIO_LABELS: 'label.size-tile.selection-tile',
    SELECTED_SIZE_VALUE_DISPLAY: 'span[data-auto="size-picker-selected-value"], span.label.updated-label.margin-left-xxxs',
  },
  BREADCRUMBS: {
    LINKS: 'ol.p-breadcrumb-list > li.p-menuitem > a',
  },
};

export const VARIANT_PRICE_RATE = 1.5;  // Change this if you want a different markup
