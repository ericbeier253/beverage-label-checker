import { NextResponse } from 'next/server';
import { getAllFormsFromDb, createFormInDb, updateFormInDb, deleteFormFromDb } from '@/lib/db';
import { checkAuth } from '@/lib/auth';
import { TTBForm } from '@/data/mockForms';

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const forms = getAllFormsFromDb();
    return NextResponse.json({ forms });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch forms' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const form: TTBForm = await request.json();
    createFormInDb(form);
    return NextResponse.json({ success: true, form });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, ...updates } = await request.json();
    const updated = updateFormInDb(id, updates);
    return NextResponse.json({ success: true, form: updated });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    
    deleteFormFromDb(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
  }
}
