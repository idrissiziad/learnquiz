'use client';

import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';

export default function DesktopNav() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  return (
    <nav className="hidden lg:flex items-center space-x-8">
      <Link
        href="/dashboard"
        className={`text-sm font-medium transition-colors hover:text-blue-600 ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}
      >
        Tableau de bord
      </Link>
      <Link
        href="/modules"
        className={`text-sm font-medium transition-colors hover:text-blue-600 ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}
      >
        Modules
      </Link>
    </nav>
  );
}
