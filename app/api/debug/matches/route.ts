import { connectToDatabase } from '../../../../lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = await connectToDatabase();
    const matches = await db.collection('matches').find({}).toArray();
    return NextResponse.json({ matches });
  } catch (error) {
    console.error('Failed to fetch matches debug route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
