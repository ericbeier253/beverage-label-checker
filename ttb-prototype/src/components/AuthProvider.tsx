'use client';

import { useState, useEffect } from 'react';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const storedKey = localStorage.getItem('access_key');
    if (storedKey) {
      verifyKey(storedKey);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  const verifyKey = async (key: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (res.ok) {
        localStorage.setItem('access_key', key);
        setIsAuthenticated(true);
        setError('');
      } else {
        localStorage.removeItem('access_key');
        setIsAuthenticated(false);
        setError('Invalid access key');
      }
    } catch (e) {
      setError('Connection error');
      setIsAuthenticated(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyKey(keyInput);
  };

  // Prevent flicker by not rendering anything until we check local storage
  if (isAuthenticated === null) return null;

  return (
    <>
      <div className={`transition-all duration-500 h-full flex flex-col ${!isAuthenticated ? 'blur-md pointer-events-none select-none' : ''}`}>
        {children}
      </div>
      
      {!isAuthenticated && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Evaluator Access</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="password"
                placeholder="Enter Access Key"
                className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Unlock Prototype
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
