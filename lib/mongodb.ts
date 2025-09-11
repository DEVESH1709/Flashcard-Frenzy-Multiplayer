import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('Please add your MongoDB URI to .env.local');
}

declare global {
  var _mongoClientPromise: Promise<MongoClient>;
}


const options = {
  tls: true,
  tlsAllowInvalidCertificates: false, 
};

const clientPromise: Promise<MongoClient> = global._mongoClientPromise ?? (global._mongoClientPromise = new MongoClient(uri, options).connect());

export async function connectToDatabase() {
  const client = await clientPromise;
  return client.db();
}
