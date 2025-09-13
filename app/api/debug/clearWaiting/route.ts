import { connectToDatabase } from '../../../../lib/mongodb';

export async function DELETE() {
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not allowed in production' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const db = await connectToDatabase();
    const waitingCol = db.collection('waiting');
    const res = await waitingCol.deleteMany({});
    return new Response(JSON.stringify({ deletedCount: res.deletedCount }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error clearing waiting collection:', err);
    return new Response(JSON.stringify({ error: 'Failed to clear waiting collection', details: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
