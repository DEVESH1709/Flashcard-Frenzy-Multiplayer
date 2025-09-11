'use client';
import { supabase } from '../../lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MatchSummary = {
  _id: string;
  players: { id: string, email: string }[];
  scores: { [key: string]: number };
  winnerEmail: string;
};

export default function HistoryPage() {
  const [userId, setUserId] = useState<string>('');
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
      } else {
        setUserId(data.user.id);
        fetchMatches(data.user.id);
      }
    });
  }, []);

  const fetchMatches = async (uid: string) => {
    const res = await fetch(`/api/matches?userId=${uid}`);
    const data = await res.json();
    const finished = data.matches.filter((m: any) => m.status === 'finished');
    setMatches(finished);
  };

  return (
    <div className="text-black">
      <h1 className="text-2xl font-bold mb-4 text-black">Match History</h1>
      {matches.length === 0 && <p className="text-black">No matches played yet.</p>}
      {matches.length > 0 && (
        <table className="min-w-full table-auto bg-white shadow-md text-black">
          <thead>
            <tr>
              <th className="px-4 py-2 text-black">Opponent</th>
              <th className="px-4 py-2 text-black">Score</th>
              <th className="px-4 py-2 text-black">Winner</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const youIndex = m.players.findIndex(p => p.id === userId);
              const oppIndex = 1 - youIndex;
              const youScore = m.scores[m.players[youIndex].id] || 0;
              const oppScore = m.scores[m.players[oppIndex].id] || 0;
              const winner = m.winnerEmail === m.players[youIndex].email ? 'You' : m.winnerEmail;
              return (
                <tr key={m._id} className="border-t text-black">
                  <td className="px-4 py-2 text-black">{m.players[oppIndex].email}</td>
                  <td className="px-4 py-2 text-black">{youScore} - {oppScore}</td>
                  <td className="px-4 py-2 text-black">{winner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
