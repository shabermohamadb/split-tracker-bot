/**
 * Cleans a name by keeping only alphabetical characters (a-z) and converting to lowercase.
 * This strips numbers, spaces, underscores, dashes, and other symbols.
 * E.g., "purge606" -> "purge", "BLACK HEART" -> "blackheart", "black_heart_99" -> "blackheart"
 */
function cleanName(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Detects if a Discord display name/nickname matches any Albion IGN from the spreadsheet.
 * Uses a multi-stage matcher to handle word tokens and clean alphabetical stems.
 *
 * @param {string} displayName - The user's Discord nickname or username.
 * @param {Array} players - Array of player records from sheets.
 * @returns {string|null} The matched IGN (with correct sheet casing), or null if no match.
 */
function detectIGN(displayName, players) {
  if (!displayName || !players || players.length === 0) return null;

  const name = displayName.trim();
  const nameLower = name.toLowerCase();

  // --- STAGE 1: Exact / Tokenized / Substring matching (preserves numbers) ---
  
  // 1.1 Direct exact match (case-insensitive)
  let match = players.find(p => p.name.toLowerCase() === nameLower);
  if (match) return match.name;

  // 1.2 Token-based exact matching (split by common dividers: |, -, [, ], (, ), /, \, and space)
  const tokens = name
    .split(/[\s|\[\]()/\-\\]+/)
    .map(t => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    match = players.find(p => p.name.toLowerCase() === token.toLowerCase());
    if (match) return match.name;
  }

  // 1.3 Substring matching for multi-word IGNs (bounded by non-word characters)
  for (const p of players) {
    const ignLower = p.name.toLowerCase();
    
    // Check multi-word or longer names to prevent false positive short matches
    if (ignLower.length >= 4 && nameLower.includes(ignLower)) {
      const escapedIgn = ignLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedIgn}\\b`, 'i');
      if (regex.test(name)) {
        return p.name;
      }
    }
  }

  // --- STAGE 2: Fuzzy / Alphabetical matching (ignoring numbers & symbols) ---
  
  // 2.1 Compare cleaned full display name to cleaned sheet IGNs
  // E.g. Discord: "blackheart99" cleans to "blackheart", Sheet: "Black Heart" cleans to "blackheart"
  const cleanDispName = cleanName(name);
  if (cleanDispName.length >= 3) {
    for (const p of players) {
      const cleanSheetName = cleanName(p.name);
      if (cleanSheetName.length >= 3 && cleanDispName === cleanSheetName) {
        return p.name;
      }
    }
  }

  // 2.2 Compare cleaned tokens to cleaned sheet IGNs
  // E.g. Discord: "purge606 | ZvZ" -> tokens: ["purge606", "ZvZ"]
  // Token "purge606" cleans to "purge", matching Sheet: "Purge" (cleans to "purge")
  for (const token of tokens) {
    const cleanToken = cleanName(token);
    if (cleanToken.length >= 3) {
      for (const p of players) {
        const cleanSheetName = cleanName(p.name);
        if (cleanSheetName.length >= 3 && cleanToken === cleanSheetName) {
          return p.name;
        }
      }
    }
  }

  return null;
}

module.exports = {
  detectIGN,
  cleanName,
};
