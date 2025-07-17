export function formatHandleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    return pathParts[pathParts.length - 1].replace(/\?.*$/, '').replace(/-/g, '_');
  } catch {
    return '';
  }
}

export function calculateVariantPrice(costPerItem) {
  return (parseFloat(costPerItem) * 1.3).toFixed(2);
}