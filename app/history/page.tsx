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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-200 p-4">
      <div className="w-full max-w-3xl bg-white/90 rounded-2xl shadow-2xl p-8 border border-blue-200">
        <h1 className="text-3xl font-extrabold mb-8 text-blue-800 tracking-tight drop-shadow text-center">Match History</h1>
        {matches.length === 0 && <p className="text-lg text-blue-700 text-center">No matches played yet.</p>}
        {matches.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto bg-white rounded-xl shadow text-blue-900">
              <thead className="bg-blue-100">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-blue-800">Opponent</th>
                  <th className="px-6 py-3 text-left font-semibold text-blue-800">Score</th>
                  <th className="px-6 py-3 text-left font-semibold text-blue-800">Winner</th>
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
                    <tr key={m._id} className="border-t border-blue-100 hover:bg-blue-50 transition">
                      <td className="px-6 py-4">{m.players[oppIndex].email}</td>
                      <td className="px-6 py-4">{youScore} - {oppScore}</td>
                      <td className="px-6 py-4 font-bold">
                        <span className={winner === 'You' ? 'text-green-600' : 'text-blue-700'}>{winner}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
