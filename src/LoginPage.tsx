import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AIChatWidget from '../components/AIChatWidget';

function LoginPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slug.trim()) {
      navigate(`/app/${slug.trim()}`);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-sm bg-white/80 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl p-6 sm:p-8">
          <h1 className="text-center text-2xl font-bold text-slate-800 mb-6">
            English Metropolis
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-slate-600 mb-1">
                Student Slug
              </label>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. szymon-karpinski"
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
                onChange={(e) => setPin(e.target.value)}
                placeholder="0000"
                className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white/90 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
      <AIChatWidget role="teacher" label="AI Tutor" description="Ask me anything about English" />
    </>
  );
}

export default LoginPage;
