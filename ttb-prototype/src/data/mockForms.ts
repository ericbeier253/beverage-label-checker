export interface TTBForm {
  id: string;
  brandName: string;
  classType: string;
  alcvol: number;
  proof: number;
  netContents: string;
  governmentWarning: string;
  producerName: string;
  countryOfOrigin?: string;
  status: "Pending" | "Approved" | "Rejected";
  hash?: string;
  approvedLabel?: string;
  contactEmail?: string;
}

/**
 * Normalizes text for strict backend database comparison.
 * Removes all punctuation, lowercases the string, and normalizes spacing.
 * This ensures that OCR inaccuracies with special characters do not break the hash lookup.
 */
export const normalizeText = (str: string) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // remove special chars, keep alphanumeric & spaces
    .trim()
    .replace(/\s+/g, '_'); // replace spaces with underscores
};

/**
 * Normalizes volume text for strict backend database comparison.
 * Standardizes units (e.g. "liters" -> "l", "milliliters" -> "ml") 
 * and strips all spaces and special characters but preserves decimals.
 */
export const normalizeVolume = (str: string) => {
  if (!str) return "";
  
  let normalized = str.toLowerCase();
  
  // Standardize units to their abbreviations
  normalized = normalized.replace(/\b(milliliters|milliliter|ml)\b/g, 'ml');
  normalized = normalized.replace(/\b(liters|liter|l)\b/g, 'l');
  normalized = normalized.replace(/\b(ounces|ounce|oz)\b/g, 'oz');
  normalized = normalized.replace(/\b(pints|pint|pt)\b/g, 'pt');
  normalized = normalized.replace(/\b(quarts|quart|qt)\b/g, 'qt');
  normalized = normalized.replace(/\b(gallons|gallon|gal)\b/g, 'gal');

  return normalized.replace(/[^a-z0-9.]/g, ''); // KEEP decimals, STRIP spaces/special chars
};

/**
 * Generates a determinisitc hash string used to match an extracted label against a database record.
 * The hash relies heavily on the core, non-changing properties of the label.
 */
export function generateFormHash(brandName: string, classType: string, netContents: string): string {
  return `${normalizeText(brandName)}|${normalizeText(classType)}|${normalizeVolume(netContents)}`;
}

const rawMockForms: TTBForm[] = [
  {
    // 1. PERFECT MATCH
    id: "FORM-2024-001",
    brandName: "The KRAKEN",
    classType: "BLACK SPICED RUM",
    alcvol: 47,
    proof: 94,
    netContents: "1.75 LITER",
    governmentWarning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    producerName: "Kraken Rum Co.",
    countryOfOrigin: "USA",
    status: "Pending",
    contactEmail: "compliance@krakenrum.com"
  },
  {
    // 2. MISMATCH ON PROOF (Expected 80, Actual 70)
    id: "FORM-2024-002",
    brandName: "OYO",
    classType: "Cherry, Peach & Apricot Flavored Vodka",
    alcvol: 35,
    proof: 80, 
    netContents: "750 Ml",
    governmentWarning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    producerName: "Middle West Spirits",
    countryOfOrigin: "USA",
    status: "Pending",
    contactEmail: "compliance@middlewestspirits.com"
  },
  {
    // 3. MISMATCH ON NET CONTENTS (Expected 1 L, Actual 750 ML)
    id: "FORM-2024-003",
    brandName: "EFFEN",
    classType: "CUCUMBER FLAVORED VODKA",
    alcvol: 37.5,
    proof: 75,
    netContents: "1 L", 
    governmentWarning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    producerName: "Effen Distillery",
    countryOfOrigin: "Netherlands",
    status: "Pending",
    contactEmail: "legal@effendistillery.com"
  },
  {
    // 4. MISMATCH ON CLASS TYPE (Expected WHITE RUM, Actual CARIBBEAN RUM)
    id: "FORM-2024-004",
    brandName: "RONRICO",
    classType: "WHITE RUM",
    alcvol: 40,
    proof: 80,
    netContents: "1.75 LITERS",
    governmentWarning: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.",
    producerName: "Ronrico Rum Company",
    countryOfOrigin: "USA",
    status: "Pending",
    contactEmail: "regulatory@ronricorum.com"
  },
  {
    // 5. MISMATCH ON GOVERNMENT WARNING (Expected GOVERNMENT WARNING, Actual SURGEON GENERAL WARNING)
    id: "FORM-2024-005",
    brandName: "Old Tom's Distillery",
    classType: "Botanical Gin",
    alcvol: 40,
    proof: 80,
    netContents: "750ml",
    governmentWarning: "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
    producerName: "Old Tom's Distillery",
    countryOfOrigin: "USA",
    status: "Pending",
    contactEmail: "info@oldtomdistillery.com"
  }
];

export const mockForms: TTBForm[] = rawMockForms.map(form => ({
  ...form,
  hash: generateFormHash(form.brandName, form.classType, form.netContents)
}));

export function getFormByHash(hash: string): TTBForm | undefined {
  return mockForms.find(form => form.hash === hash);
}

// Levenshtein distance algorithm for fuzzy matching lookup hashes
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

export function getClosestFormByHash(hash: string, threshold: number = 20): { form: TTBForm, distance: number } | undefined {
  let closestForm: TTBForm | undefined;
  let minDistance = Infinity;

  for (const form of mockForms) {
    if (!form.hash) continue;
    const distance = levenshteinDistance(hash, form.hash);
    if (distance < minDistance) {
      minDistance = distance;
      closestForm = form;
    }
  }

  if (closestForm && minDistance <= threshold) {
    return { form: closestForm, distance: minDistance };
  }

  return undefined;
}

export function updateForm(id: string, updates: Partial<TTBForm>): TTBForm | undefined {
  const form = mockForms.find(f => f.id === id);
  if (form) {
    Object.assign(form, updates);
    return form;
  }
  return undefined;
}
