import { connectToDatabase } from '../../../lib/mongodb';

export async function GET() {
  const db = await connectToDatabase();
  const cards = await db.collection('flashcards').find().toArray();
  return Response.json({ flashcards: cards });
}
