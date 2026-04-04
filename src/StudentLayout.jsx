import { Outlet, useParams } from 'react-router-dom';

export default function StudentLayout() {
  const { slug } = useParams<{ slug: string }>();
  
  // Mock student data for now
  const student = {
    firstName: slug?.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Student',
    lastName: 'User',
    level: 'C1'
  };

  return (
    <div className="font-body text-slate-900 min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 relative">
      {/* Ambient orbs */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[8%] left-[-8%] w-[23rem] h-[23rem] bg-gradient-circle orb-blue filter blur-[70px] opacity-0.5"></div>
        <div className="absolute top-[12%] right-[-4%] w-[20rem] h-[20rem] bg-gradient-circle orb-violet filter blur-[70px] opacity-0.5"></div>
        <div className="absolute bottom-[4%] left-[28%] w-[24rem] h-[24rem] bg-gradient-circle orb-emerald filter blur-[70px] opacity-0.5"></div>
        <div className="absolute bottom-[12%] right-[8%] w-[18rem] h-[18rem] bg-gradient-circle orb-warm filter blur-[70px] opacity-0.5"></div>
      </div>

      {/* Main content */}
      <main className="relative z-10 px-4 pb-6 sm:px-6 lg:px-8 pt-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {student.firstName}!</h1>
            <p className="text-slate-600 mt-1">Continue your English learning journey.</p>
          </div>
          
          <Outlet />
        </div>
      </main>
    </div>
  );
}