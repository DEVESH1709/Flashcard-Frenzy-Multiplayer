'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [user, setUser] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user?.email ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) return null;
  return (
    <nav className="backdrop-blur-md bg-white/20 border-b border-gray-200 shadow-lg text-gray-900 px-6 py-3 flex items-center justify-between rounded-b-2xl mx-2 mt-2">
      <div className="flex items-center gap-6">
  <Link href="/dashboard" className="font-semibold text-lg text-gray-900 hover:text-blue-700 transition-colors">Dashboard</Link>
  <Link href="/history" className="font-semibold text-lg text-gray-900 hover:text-purple-700 transition-colors">History</Link>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full shadow">
          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
            {user[0]?.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">{user}</span>
        </div>
        <button
          onClick={handleLogout}
          className="bg-gradient-to-r from-blue-100 to-blue-500 text-white px-4 py-2 rounded-xl cursor-pointer font-semibold shadow hover:from-blue-600 hover:to-white-600 transition-all duration-200"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
