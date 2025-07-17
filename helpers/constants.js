export const SELECTORS = {
  PRODUCT: {
    TITLE: 'h1[data-test="product-title"]',
    CURRENT_PRICE: 'span[data-test="product-price"]',
    ORIGINAL_PRICE: 'span.h-text-line-through',
    DESCRIPTION_BUTTON: 'button[href="#ProductDetails-accordion-scroll-id"]',
    DESCRIPTION_CONTENT: 'div[data-test="item-details-description"]',
    MAIN_IMAGE: 'div[data-test="image-gallery-item-0"] img',
    VARIATION_SELECTOR: 'div[data-module-type="ProductDetailVariationSelector"]'
  },
  BREADCRUMBS: {
    LINKS: 'a[data-test="@web/Breadcrumbs/BreadcrumbLink"]'
  }
};

export const EXCHANGE_RATE = 3.675;
export const VARIANT_PRICE_RATE = 1.3;