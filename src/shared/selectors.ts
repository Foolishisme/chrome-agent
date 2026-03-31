export const JD_SELECTORS = {
  homeSearchInput: ["#key", "input[name='keyword']", ".search-m input[type='text']"],
  homeSearchButton: [".button", "button.button", ".form button", ".search-m button"],
  searchInput: ["#key", "input[name='keyword']", ".search-m input[type='text']"],
  searchButton: [".button", "button.button", ".search-m button"],
  resultCards: ["#J_goodsList .gl-item", ".gl-warp .gl-item"],
  resultTitle: [".p-name em", ".p-name a em", ".sku-name"],
  resultLink: [".p-name a", ".p-img a"],
  resultPrice: [".p-price strong", ".p-price", ".price"],
  resultShop: [".p-shop a", ".curr-shop a", ".shopname"],
  resultTagSpans: [".p-icons i", ".p-commit a", ".promo-words"],
  resultSummary: [".p-commit strong", ".p-promotions", ".p-ad"],
};
