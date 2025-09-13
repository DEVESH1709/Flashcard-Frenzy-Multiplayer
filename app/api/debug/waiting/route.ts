import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../lib/mongodb';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }
  try {
    const db = await connectToDatabase();
    const waiting = await db.collection('waiting').find({}).toArray();
    const cleaned = waiting.map((w) => ({
      userId: (w as { userId?: string }).userId ?? '',
      joinedAt: (w as { joinedAt?: Date }).joinedAt ?? null,
      _id: w._id
    }));
    return NextResponse.json({ waiting: cleaned }, { status: 200 });
  } catch (err) {
    console.error('Error reading waiting collection:', err);
    return NextResponse.json({ error: 'Failed to read waiting collection' }, { status: 500 });
  }
}
