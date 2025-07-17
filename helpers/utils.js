export function formatHandleFromUrl(url) {
  return url.split("?")[0].split("/").pop().replace(/[^a-zA-Z0-9]+/g, "_");
}

export function capitalizeFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

export function calculatePrices(cost) {
  const variantPrice = Math.ceil(cost * 1.3);
  const compareAtPrice = Math.ceil(variantPrice * 1.2);
  return { variantPrice, compareAtPrice };
}
