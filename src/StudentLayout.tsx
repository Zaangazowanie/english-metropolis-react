import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import StickyHeader from '../components/StickyHeader';
import AIChatWidget from '../components/AIChatWidget';
import { StudentProvider } from '../contexts/StudentContext';
import { STUDENTS } from '../data/student-config';

export default function StudentLayout() {
  const { slug } = useParams<{ slug: string }>();
  
  useEffect(() => {
    const student = STUDENTS[slug as keyof typeof STUDENTS];
    if (student) {
      (window as any).__STUDENT_ID = student.studentId;
    }
  }, [slug]);

  const student = STUDENTS[slug as keyof typeof STUDENTS];

  return (
    <div className="font-body text-on-surface min-h-screen selection:bg-primary-fixed-dim relative">
      <div aria-hidden="true" className="ambient-stage">
        <div className="ambient-orb orb-blue"></div>
        <div className="ambient-orb orb-violet"></div>
        <div className="ambient-orb orb-emerald"></div>
        <div className="ambient-orb orb-warm"></div>
      </div>

      <StickyHeader />

      <main className="relative px-4 pb-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <StudentProvider student={student!}>
            <Outlet />
          </StudentProvider>
        </div>
      </main>

      <AIChatWidget studentName={student?.firstName} />
    </div>
  );
}
