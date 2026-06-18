import { NextResponse } from 'next/server';
import { updateFormInDb } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { formId, imageUrl } = body;

    if (!formId || !imageUrl) {
      return NextResponse.json({ error: 'formId and imageUrl are required' }, { status: 400 });
    }

    // Update the database record status to "Approved" and attach the successful label image
    const updatedForm = updateFormInDb(formId, {
      status: 'Approved',
      approvedLabel: imageUrl
    });

    if (!updatedForm) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, form: updatedForm });

  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
