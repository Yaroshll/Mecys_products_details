export function formatHandleFromUrl(url, fallbackTitle = '') {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    let handle = pathParts.pop() || pathParts.pop();
    if (!handle) {
      return fallbackTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
    }
    return handle.replace(/\?.*$/, '').replace(/[^a-zA-Z0-9]+/g, '_');
  } catch {
    return fallbackTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
  }
}

export function calculateVariantPrice(costPerItem) {
  return (parseFloat(costPerItem) * 1.3).toFixed(2);
}
