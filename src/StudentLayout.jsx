import { Outlet, useParams } from 'react-router-dom';
import StickyHeader from './StickyHeader.jsx';

export default function StudentLayout() {
  const { slug } = useParams();

  return (
    <div className="font-body text-slate-900 min-h-screen relative" style={{ background: 'radial-gradient(circle at top left, rgba(255,255,255,0.86), rgba(255,255,255,0) 34%), linear-gradient(180deg, #f8f2ea 0%, #eef4ff 38%, #edf6f1 100%)', backgroundAttachment: 'fixed' }}>
      {/* Ambient orbs */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[8%] left-[-8%] w-[23rem] h-[23rem] rounded-full filter blur-[70px] opacity-50" style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.6), rgba(96,165,250,0.2) 40%, transparent 72%)' }}></div>
        <div className="absolute top-[12%] right-[-4%] w-[20rem] h-[20rem] rounded-full filter blur-[70px] opacity-50" style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.6), rgba(167,139,250,0.2) 40%, transparent 72%)' }}></div>
        <div className="absolute bottom-[4%] left-[28%] w-[24rem] h-[24rem] rounded-full filter blur-[70px] opacity-50" style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.5), rgba(52,211,153,0.2) 40%, transparent 72%)' }}></div>
      </div>

      <StickyHeader />

      {/* Main content */}
      <main className="relative z-10 px-4 pb-6 sm:px-6 lg:px-8 pt-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
