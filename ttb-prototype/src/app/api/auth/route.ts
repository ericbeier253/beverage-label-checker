import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { key } = await request.json();
    const serverKey = process.env.EVALUATOR_ACCESS_KEY;
    
    if (!serverKey) {
      // If no key is set on the server, we allow access (fallback for dev)
      return NextResponse.json({ success: true });
    }

    if (key === serverKey) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid key' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
