import { NextResponse } from 'next/server';
import { generateFormHash, normalizeText, normalizeVolume } from '@/data/mockForms';
import { getFormByHashFromDb, getClosestFormByHashFromDb } from '@/lib/db';
import { validateLabelData } from '@/lib/validation';
import { checkAuth } from '@/lib/auth';

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mergedData } = body;

    if (!mergedData) {
      return NextResponse.json({ error: 'mergedData is required' }, { status: 400 });
    }

    // The hash is derived from the core, non-changing properties of the label.
    // This allows us to lookup the database record for this specific bottle.
    const derivedHash = generateFormHash(mergedData.brandName, mergedData.classType, mergedData.netContents);

    const normalizedData = {
      brandName: normalizeText(mergedData.brandName),
      classType: normalizeText(mergedData.classType),
      netContents: normalizeVolume(mergedData.netContents)
    };

    let expectedForm = getFormByHashFromDb(derivedHash);
    let isFuzzyMatch = false;

    // If an exact hash match fails (e.g. OCR typo in a core field), 
    // fall back to a Levenshtein fuzzy search. This prevents the entire pipeline
    // from crashing and allows our validation logic to isolate the specific error.
    if (!expectedForm) {
      const closestMatch = getClosestFormByHashFromDb(derivedHash);
      if (closestMatch) {
        expectedForm = closestMatch.form;
        isFuzzyMatch = true;
      } else {
        return NextResponse.json({ 
          error: 'No application form found for this label.', 
          hash: derivedHash,
          normalized: normalizedData
        }, { status: 404 });
      }
    }

    const validationResults = validateLabelData(expectedForm, mergedData);

    return NextResponse.json({
      success: true,
      normalized: normalizedData,
      validation: validationResults,
      formId: expectedForm.id,
      hash: derivedHash,
      expectedForm: expectedForm,
      isFuzzyMatch
    });

  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json({ error: 'Internal server error during validation' }, { status: 500 });
  }
}
