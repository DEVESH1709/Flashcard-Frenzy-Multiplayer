import type { NextRequest } from 'next/server';
import { connectToDatabase } from '../../../lib/mongodb';

export async function POST(request: NextRequest) {
  const { id, email } = await request.json();
  const db = await connectToDatabase();
  await db.collection('users').updateOne(
    { id },
    { $set: { id, email } },
    { upsert: true }
  );
  return Response.json({ success: true });
}
