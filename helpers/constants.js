export const SELECTORS = {
  PRODUCT: {
    TITLE: 'h1.product-title',
    BRAND: 'h1.product-title a',
    PRODUCT_NAME: 'h1.product-title span',
    PRICE: 'div.price-wrapper span[aria-label]',
    MAIN_IMAGE: 'div.picture-container img',
    COLOR_SWATCHES: 'div.color-swatches',
    COLOR_OPTIONS: 'form.colors-form.overflow-gutters-item ol li',
    SIZE_SECTION: 'div[data-testid="size-chips"]',
    SIZE_OPTIONS: 'fieldset div.cell.shrink',
    DESCRIPTION_BUTTON: 'button.switch.link-med',
    DESCRIPTION_CONTENT: 'div#details-drawer div > p.value',
    BREADCRUMBS: 'ol.p-breadcrumb-list li.p-menuitem:not(:first-child) a'
  }
};

export const CSV_HEADERS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Variant SKU',
  'Option1 Name',
  'Option1 Value',
  'Option2 Name',
  'Option2 Value',
  'Cost per item',
  'Variant Price',
  'Variant Image',
  'Image Src',
  'Variant Fulfillment Service',
  'Variant Inventory Policy',
  'Variant Inventory Tracker',
  'Type',
  'Vendor',
  'Tags',
  'original_product_url'
];
