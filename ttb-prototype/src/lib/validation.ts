import { normalizeText, normalizeVolume } from '../data/mockForms';

export interface ValidationResult {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  isExactRule: boolean;
}

export const normalizeWarningText = (str: string) => {
  if (!str) return "";
  // Note: This normalizer is purely for strict backend boolean comparisons (`match: true|false`). 
  // The UI will intentionally still display the RAW extracted text (hyphens included) 
  // so the analyst can see exactly what the OCR engine interpreted.
  return str
    .replace(/-\s*/g, '') // Fix line-break hyphenation (e.g. "BEV- ERAGES" or "SUR-\nGEON" -> "BEVERAGES", "SURGEON")
    .toLowerCase() // Body can be any case
    .replace(/[^a-z0-9\s]/g, '') // Strip punctuation
    .trim()
    .replace(/\s+/g, ' '); // Normalize spaces
};

/**
 * Validates the extracted Government Warning against the database expectation.
 * Enforces the strict TTB rule that "GOVERNMENT WARNING:" must be fully capitalized.
 * Uses the normalizer to ignore internal line breaks and hyphens.
 */
export function validateWarning(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  
  // TTB Rule: "GOVERNMENT WARNING:" must be exactly capitalized.
  if (!actual.includes("GOVERNMENT WARNING:")) {
    return false;
  }
  
  return normalizeWarningText(expected) === normalizeWarningText(actual);
}

/**
 * Runs a field-by-field validation comparing the TTBForm database record
 * against the final merged OCR extraction. Returns a detailed array
 * of boolean matches for the UI to display.
 */
export function validateLabelData(expectedForm: any, extractedLabel: any): ValidationResult[] {
  return [
    {
      field: 'Brand Name',
      expected: expectedForm.brandName,
      actual: extractedLabel.brandName || "",
      match: normalizeText(expectedForm.brandName) === normalizeText(extractedLabel.brandName),
      isExactRule: false
    },
    {
      field: 'Class/Type',
      expected: expectedForm.classType,
      actual: extractedLabel.classType || "",
      match: normalizeText(expectedForm.classType) === normalizeText(extractedLabel.classType),
      isExactRule: false
    },
    {
      field: 'ABV (%)',
      expected: expectedForm.alcvol?.toString() || "NaN",
      actual: extractedLabel.alcvol?.toString() || "NaN",
      match: expectedForm.alcvol === extractedLabel.alcvol,
      isExactRule: true
    },
    {
      field: 'Proof',
      expected: expectedForm.proof?.toString() || "NaN",
      actual: extractedLabel.proof?.toString() || "NaN",
      match: expectedForm.proof === extractedLabel.proof,
      isExactRule: true
    },
    {
      field: 'Net Contents',
      expected: expectedForm.netContents,
      actual: extractedLabel.netContents || "",
      match: normalizeVolume(expectedForm.netContents) === normalizeVolume(extractedLabel.netContents),
      isExactRule: false
    },
    {
      field: 'Government Warning',
      expected: expectedForm.governmentWarning,
      actual: extractedLabel.governmentWarning || "",
      match: validateWarning(expectedForm.governmentWarning, extractedLabel.governmentWarning),
      isExactRule: true
    }
  ];
}
