import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function LoginPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!slug.trim()) {
      setError('Please enter your student slug.');
      return;
    }
    if (!pin.trim()) {
      setError('Please enter your PIN.');
      return;
    }
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setError('PIN must be 4–8 digits.');
      return;
    }

    // TODO: Replace with real API call to validate slug + PIN
    // For now, navigate directly (auth is a stub)
    navigate(`/app/${slug.trim()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-sm bg-white/80 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl p-6 sm:p-8">
        <h1 className="text-center text-2xl font-bold text-slate-800 mb-2">
          English Metropolis
        </h1>
        <p className="text-center text-sm text-slate-500 mb-6">
          Enter your student credentials to continue
        </p>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-slate-600 mb-1">
              Student Slug
            </label>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setError(''); }}
              placeholder="e.g. szymon-karpinski"
              autoComplete="username"
              autoFocus
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white/90 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-slate-600 mb-1">
              PIN
            </label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              placeholder="0000"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={8}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white/90 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
