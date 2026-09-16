// app/admin/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase, AttendanceRecord, Student, Batch } from '@/lib/supabase';

// Helper type merging relations for the UI table
type EnrichedAttendance = AttendanceRecord & {
  students: { name: string };
  batches: { name: string };
};

export default function AdminDashboard() {
  const [feed, setFeed] = useState<EnrichedAttendance[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  
  // Manual Override State
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [isManualLoading, setIsManualLoading] = useState<boolean>(false);

  // Fetch initial data
  const loadDashboardData = async () => {
    // 1. Fetch live attendance feed joined with student and batch names
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*, students(name), batches(name)')
      .order('timestamp', { ascending: false })
      .limit(50);
      
    if (attendanceData) setFeed(attendanceData as any);

    // 2. Fetch lists for the manual override dropdowns
    const { data: studentData } = await supabase.from('students').select('*').order('name');
    const { data: batchData } = await supabase.from('batches').select('*').order('name');
    
    if (studentData) setStudents(studentData);
    if (batchData) setBatches(batchData);
  };

  useEffect(() => {
    loadDashboardData();

    // Set up Supabase Realtime subscription to auto-update the table when students scan in
    const channel = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, () => {
        loadDashboardData(); // Refresh feed on new insert
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleManualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsManualLoading(true);

    const student = students.find(s => s.id === selectedStudent);
    if (!student) return;

    const { error } = await supabase.from('attendance').insert({
      student_id: student.id,
      batch_id: student.batch_id,
      is_manual: true,
      marked_by: 'admin',
    });

    if (error) alert(`Error marking manual attendance: ${error.message}`);
    else setSelectedStudent('');
    
    setIsManualLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Top Section: Manual Override Form */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Manual Attendance Override</h2>
          <form onSubmit={handleManualOverride} className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Student (No Phone)</label>
              <select
                required
                className="w-full border border-gray-300 rounded-md p-2"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                <option value="">-- Select Student --</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button
              type="submit"
              disabled={isManualLoading || !selectedStudent}
              className="bg-blue-600 text-white px-6 py-2 rounded-md font-semibold disabled:bg-gray-400"
            >
              {isManualLoading ? 'Saving...' : 'Mark Present'}
            </button>
          </form>
        </div>

        {/* Bottom Section: Live Feed Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">Live Attendance Feed</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm">
                  <th className="p-4 border-b">Time</th>
                  <th className="p-4 border-b">Student</th>
                  <th className="p-4 border-b">Batch</th>
                  <th className="p-4 border-b">Method</th>
                  <th className="p-4 border-b">Distance</th>
                  <th className="p-4 border-b">Selfie</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 border-b last:border-0">
                    <td className="p-4 text-sm text-gray-700">
                      {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4 font-medium text-gray-900">{record.students?.name}</td>
                    <td className="p-4 text-sm text-gray-600">{record.batches?.name}</td>
                    <td className="p-4">
                      {record.is_manual ? (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">Manual Admin</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">Biometric</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {record.is_manual ? 'N/A' : `${Math.round(record.distance_meters || 0)}m`}
                    </td>
                    <td className="p-4">
                      {record.photo_url ? (
                        <img src={record.photo_url} alt="Selfie" className="h-10 w-10 rounded-full object-cover border border-gray-300" />
                      ) : (
                        <span className="text-gray-400 text-xs">No Photo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {feed.length === 0 && (
              <div className="p-8 text-center text-gray-500">No attendance records yet today.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}