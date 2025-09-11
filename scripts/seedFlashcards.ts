import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!; 
const client = new MongoClient(uri);

async function seed() {
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection("flashcards");

    await collection.deleteMany({});

    await collection.insertMany([
      {
        question: "What is the capital of France?",
        answer: "Paris",
      },
      {
        question: "What is 5 + 7?",
        answer: "12",
      },
      {
        question: "Who wrote 'Hamlet'?",
        answer: "Shakespeare",
      },
      {
        question: "What is the largest planet in our Solar System?",
        answer: "Jupiter",
      },
      {
        question: "Which language runs in a web browser?",
        answer: "JavaScript",
      },
    ]);

    console.log("Flashcards seeded successfully!");
  } catch (err) {
    console.error("Error seeding flashcards:", err);
  } finally {
    await client.close();
  }
}

seed();
