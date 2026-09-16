// app/page.tsx
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Attendance Portal</h1>
        <p className="text-gray-600">Please select an option below to continue.</p>
        
        <div className="flex flex-col space-y-4 pt-4">
          <Link 
            href="/attend" 
            className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-green-700 transition"
          >
            Mark Daily Attendance
          </Link>
          
          <Link 
            href="/register" 
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-blue-700 transition"
          >
            Register New Device
          </Link>
        </div>

        <div className="pt-8 mt-8 border-t border-gray-100">
          <Link 
            href="/admin" 
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}