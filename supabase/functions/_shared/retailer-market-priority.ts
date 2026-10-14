/** Give Morocco three of every four 15-minute validation slots; reserve the fourth for other markets. */
export function primaryRetailerValidationMarket(epochMs = Date.now()): "MA" | "GLOBAL" {
  const slot = Math.floor(epochMs / (15 * 60 * 1000)) % 4;
  return slot === 3 ? "GLOBAL" : "MA";
}
