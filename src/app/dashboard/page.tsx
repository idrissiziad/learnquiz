'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveModules, preloadModuleData, refreshModules, Question } from '@/data/modules/client';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

interface ModuleStats {
  questionCount: number;
  chapterCount: number;
  loaded: boolean;
}

interface SearchResult {
  type: 'module' | 'question';
  moduleId: number;
  moduleTitle: string;
  questionId?: string;
  questionText?: string;
  chapter?: string;
  year?: string;
  questionIndex?: number;
}

interface ScanRegistered {
  id: number;
  title: string;
  json_filename: string;
  exists: boolean;
  questionCount: number;
}

interface ScanOrphan {
  json_filename: string;
  questionCount: number;
}

interface ScanData {
  registered: ScanRegistered[];
  orphans: ScanOrphan[];
  missing: ScanRegistered[];
}

export default function Dashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, getAllProgress } = useAuth();
  const isDarkMode = theme === 'dark';
  const modules = useLiveModules();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [allModuleQuestions, setAllModuleQuestions] = useState<Map<number, Question[]>>(new Map());
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [moduleStats, setModuleStats] = useState<Map<number, ModuleStats>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const loadQuestionsRef = useRef<Promise<Map<number, Question[]> | null> | null>(null);

  const [showAdmin, setShowAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<'automatic' | 'manual'>('automatic');
  const [adminMode, setAdminMode] = useState<'new' | 'append'>('new');
  const [adminTitle, setAdminTitle] = useState('');
  const [adminModuleId, setAdminModuleId] = useState<number>(modules[0]?.id ?? 1);
  const [adminDescription, setAdminDescription] = useState('');
  const [adminLevels, setAdminLevels] = useState<string[]>(['1ère année']);
  const [adminGradient, setAdminGradient] = useState('from-blue-400 to-blue-600');
  const [adminQuestions, setAdminQuestions] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminStatus, setAdminStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Automatic mode state
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSyncing, setScanSyncing] = useState(false);
  const [syncLevels, setSyncLevels] = useState<string[]>(['1ère année']);
  const [syncGradient, setSyncGradient] = useState('from-blue-400 to-blue-600');
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [removeDeleteFile, setRemoveDeleteFile] = useState(true);

  const LEVEL_OPTIONS = [
    '1ère année', '2ème année', '3ème année',
    '4ème année', '5ème année', '6ème année',
  ];
  const GRADIENT_OPTIONS = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-red-400 to-red-600',
    'from-yellow-400 to-yellow-600',
    'from-indigo-400 to-indigo-600',
    'from-pink-400 to-pink-600',
    'from-teal-400 to-teal-600',
  ];

  const runScan = useCallback(async () => {
    setScanLoading(true);
    setAdminStatus(null);
    try {
      const res = await fetch('/api/modules/manage');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Scan échoué.');
      setScanData(data.scan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminStatus({ type: 'error', message: msg });
    } finally {
      setScanLoading(false);
    }
  }, []);

  const runSync = useCallback(async () => {
    setScanSyncing(true);
    setAdminStatus(null);
    try {
      const res = await fetch('/api/modules/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          levels: syncLevels,
          gradient: syncGradient,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Sync échoué.');
      const parts: string[] = [];
      if (data.added?.length) parts.push(`${data.added.length} module(s) ajouté(s)`);
      if (data.removed?.length) parts.push(`${data.removed.length} entrée(s) supprimée(s)`);
      setAdminStatus({
        type: 'success',
        message: parts.length ? `Synchronisé : ${parts.join(', ')}.` : (data.message || 'Déjà synchronisé.'),
      });
      await refreshModules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminStatus({ type: 'error', message: msg });
    } finally {
      setScanSyncing(false);
    }
  }, [syncLevels, syncGradient]);

  const runRemove = useCallback(async () => {
    if (removeTarget === null) return;
    setScanSyncing(true);
    setAdminStatus(null);
    try {
      const res = await fetch('/api/modules/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove',
          moduleId: removeTarget,
          deleteFile: removeDeleteFile,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Suppression échouée.');
      setAdminStatus({
        type: 'success',
        message: `Module « ${data.moduleTitle} » supprimé${data.deletedFile ? ' (fichier JSON supprimé)' : ''}.`,
      });
      setRemoveTarget(null);
      await refreshModules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminStatus({ type: 'error', message: msg });
    } finally {
      setScanSyncing(false);
    }
  }, [removeTarget, removeDeleteFile]);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminStatus(null);

    if (!adminTitle.trim()) {
      setAdminStatus({ type: 'error', message: 'Le titre est requis.' });
      return;
    }
    if (!adminQuestions.trim()) {
      setAdminStatus({ type: 'error', message: 'Veuillez coller les questions (JSON).' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(adminQuestions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminStatus({ type: 'error', message: `JSON invalide : ${msg}` });
      return;
    }

    setAdminSubmitting(true);
    try {
      const res = await fetch('/api/modules/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: adminMode,
          title: adminTitle.trim(),
          moduleId: adminMode === 'append' ? adminModuleId : undefined,
          description: adminDescription,
          levels: adminLevels,
          gradient: adminGradient,
          questions: parsed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Échec de l\'ajout.');
      }

      setAdminStatus({
        type: 'success',
        message:
          adminMode === 'new'
            ? `Module « ${data.moduleTitle} » créé (id ${data.moduleId}). ${data.added} question(s) ajoutée(s) dans ${data.filename}.`
            : `${data.added} question(s) ajoutée(s) à « ${data.moduleTitle} » (total : ${data.total}).`,
      });

      setAdminTitle('');
      setAdminQuestions('');
      setAdminDescription('');
      setAdminLevels(['1ère année']);
      setAdminGradient('from-blue-400 to-blue-600');

      // Bust the client-side data cache and reload stats so the dashboard reflects changes.
      await refreshModules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdminStatus({ type: 'error', message: msg || 'Échec de l\'ajout.' });
    } finally {
      setAdminSubmitting(false);
    }
  };

  const toggleLevel = (level: string) => {
    setAdminLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  useEffect(() => {
    getAllProgress().catch(() => {});
  }, [getAllProgress]);

  useEffect(() => {
    const loadModuleStats = async () => {
      try {
        const res = await fetch('/api/modules/stats');
        const data = await res.json();
        const statsMap = new Map<number, ModuleStats>();
        if (data.success && data.stats) {
          for (const mod of modules) {
            const s = data.stats[mod.id];
            if (s) {
              statsMap.set(mod.id, { questionCount: s.questionCount, chapterCount: s.chapterCount, loaded: true });
            } else {
              statsMap.set(mod.id, { questionCount: 0, chapterCount: 0, loaded: false });
            }
          }
        }
        setModuleStats(statsMap);
      } catch {
        const statsMap = new Map<number, ModuleStats>();
        for (const mod of modules) {
          statsMap.set(mod.id, { questionCount: 0, chapterCount: 0, loaded: false });
        }
        setModuleStats(statsMap);
      }
      setIsLoading(false);
    };

    loadModuleStats();
  }, [modules]);

  const loadAllQuestions = useCallback(async (): Promise<Map<number, Question[]> | null> => {
    if (questionsLoaded) return allModuleQuestions;
    if (loadQuestionsRef.current) return loadQuestionsRef.current;

    loadQuestionsRef.current = (async () => {
      const questionsMap = new Map<number, Question[]>();
      const results = await Promise.all(
        modules.map(async (mod) => {
          try {
            const { questions } = await preloadModuleData(mod.id);
            return { id: mod.id, questions };
          } catch {
            return { id: mod.id, questions: [] as Question[] };
          }
        })
      );
      for (const result of results) {
        questionsMap.set(result.id, result.questions);
      }
      setAllModuleQuestions(questionsMap);
      setQuestionsLoaded(true);
      loadQuestionsRef.current = null;
      return questionsMap;
    })();

    return loadQuestionsRef.current;
  }, [questionsLoaded, allModuleQuestions]);

  const totalQuestions = Array.from(moduleStats.values()).reduce((sum, s) => sum + s.questionCount, 0);
  const totalChapters = Array.from(moduleStats.values()).reduce((sum, s) => sum + s.chapterCount, 0);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);

    const moduleResults: SearchResult[] = [];
    const lowerQuery = query.toLowerCase().trim();

    for (const mod of modules) {
      if (mod.title.toLowerCase().includes(lowerQuery) || 
          mod.description.toLowerCase().includes(lowerQuery)) {
        moduleResults.push({
          type: 'module',
          moduleId: mod.id,
          moduleTitle: mod.title
        });
      }
    }

    const questionsMap = await loadAllQuestions();
    const questionResults: SearchResult[] = [];

    if (questionsMap) {
      for (const mod of modules) {
        const questions = questionsMap.get(mod.id) || [];
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (q.question.toLowerCase().includes(lowerQuery) ||
              (q.chapter && q.chapter.toLowerCase().includes(lowerQuery)) ||
              (q.year && q.year.toLowerCase().includes(lowerQuery)) ||
              q.options.some(opt => opt.toLowerCase().includes(lowerQuery))) {
            questionResults.push({
              type: 'question',
              moduleId: mod.id,
              moduleTitle: mod.title,
              questionId: q.id,
              questionText: q.question,
              chapter: q.chapter,
              year: q.year,
              questionIndex: i
            });
          }
        }
      }
    }

    const topQuestionResults = questionResults.slice(0, 20);
    setSearchResults([...moduleResults, ...topQuestionResults]);
    setShowResults(true);
    setIsSearching(false);
  }, [loadAllQuestions]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.trim()) {
      debounceRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, performSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(searchQuery);
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'module') {
      router.push(`/modules/${result.moduleId}`);
    } else {
      router.push(`/modules/${result.moduleId}?q=${result.questionIndex}`);
    }
    setSearchQuery('');
    setShowResults(false);
    setSearchResults([]);
  };

  const quickStats = [
    { label: 'Modules', value: modules.length, icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', gradient: 'from-blue-500 to-blue-600', bgLight: 'bg-blue-50', bgDark: 'bg-blue-900/30' },
    { label: 'Questions', value: totalQuestions || '...', icon: 'M8.228 9c.549-1.165 2.36-2 4.272-2C14.528 7 16 8.153 16 9.5c0 1.657-1.623 2.417-3.176 3.01-.842.326-1.475.77-1.475 1.49v.5M12 17h.01M9 12h6', gradient: 'from-emerald-500 to-emerald-600', bgLight: 'bg-emerald-50', bgDark: 'bg-emerald-900/30' },
    { label: 'Chapitres', value: totalChapters || '...', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', gradient: 'from-purple-500 to-purple-600', bgLight: 'bg-purple-50', bgDark: 'bg-purple-900/30' },
    { label: 'Années', value: '7', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', gradient: 'from-amber-500 to-orange-500', bgLight: 'bg-amber-50', bgDark: 'bg-amber-900/30' },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  return (
    <div className={`min-h-screen overflow-x-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <header className={`${isDarkMode ? 'bg-gray-800/95 backdrop-blur-md border-gray-700' : 'bg-white/95 backdrop-blur-md border-gray-200'} border-b sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <Link href="/dashboard" className="flex items-center min-w-0 group">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center mr-2 sm:mr-3 shadow-lg shadow-green-500/25 group-hover:shadow-green-500/40 transition-shadow flex-shrink-0">
                <div className="flex space-x-0.5 sm:space-x-1">
                  <div className="w-0.5 sm:w-1 h-3 sm:h-4 bg-white rounded"></div>
                  <div className="w-0.5 sm:w-1 h-3 sm:h-4 bg-white rounded"></div>
                </div>
              </div>
              <span className={`text-lg sm:text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'} truncate`}>LearnFMPA</span>
            </Link>

            <nav className="hidden md:flex items-center space-x-8">
              <Link href="/dashboard" className={`${isDarkMode ? 'text-green-400' : 'text-green-600'} font-medium text-sm relative after:absolute after:bottom-[-4px] after:left-0 after:w-full after:h-0.5 after:bg-green-500 after:rounded-full`}>
                Tableau de bord
              </Link>
              <Link href="/modules" className={`${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-800'} transition-colors font-medium text-sm`}>
                Modules
              </Link>
              <Link href="/progress" className={`${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-800'} transition-colors font-medium text-sm`}>
                Progression
              </Link>
            </nav>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <ThemeToggle />
              <Link
                href="/modules"
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <div className={`relative overflow-hidden rounded-2xl mb-8 ${isDarkMode ? 'bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600' : 'bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500'} p-6 sm:p-8`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative z-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
              {getGreeting()}, {user?.name?.replace(/_/g, ' ') || 'Étudiant'}
            </h1>
            <p className="text-green-100 text-sm sm:text-base lg:text-lg max-w-xl">
              Continuez votre progression vers l&apos;excellence. Explorez les modules et testez vos connaissances.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5 mb-8">
          {quickStats.map((stat, index) => (
            <div
              key={index}
              className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-4 sm:p-5 shadow-sm border ${isDarkMode ? 'border-gray-700' : 'border-gray-100'} hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}
            >
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                </svg>
              </div>
              <div className={`text-2xl sm:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'} mb-0.5`}>
                {isLoading ? '...' : stat.value}
              </div>
              <div className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 shadow-sm border overflow-hidden ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                  <svg className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Recherche rapide
                </h2>
              </div>
              <div className="relative">
                <form onSubmit={handleSearch}>
                  <div className={`group flex flex-col sm:flex-row items-stretch sm:items-center rounded-xl border-2 overflow-hidden min-w-0 ${isDarkMode ? 'border-gray-600 bg-gray-700/50 focus-within:border-green-500' : 'border-gray-200 bg-gray-50 focus-within:border-green-500'} transition-all`}>
                    <div className={`flex items-center px-4 py-3 border-b sm:border-b-0 sm:border-r ${isDarkMode ? 'border-gray-600 group-focus-within:border-green-500' : 'border-gray-200 group-focus-within:border-green-500'} transition-colors`}>
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher un module, chapitre ou question..."
                        className={`w-full px-4 py-3 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-sm sm:text-base ${isDarkMode ? 'text-white bg-transparent placeholder-gray-400' : 'text-gray-800 bg-transparent placeholder-gray-500'}`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium text-sm hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm flex-shrink-0"
                    >
                      Rechercher
                    </button>
                  </div>
                </form>

                {showResults && (
                  <div className={`absolute left-0 right-0 mt-2 rounded-xl border overflow-hidden z-40 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} shadow-lg max-h-80 sm:max-h-96 overflow-y-auto`}>
                    {isSearching ? (
                      <div className="p-4 text-center">
                        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="divide-y divide-gray-200 dark:divide-gray-600">
                        {searchResults.map((result, index) => (
                          <button
                            key={`${result.type}-${result.moduleId}-${result.questionId || index}`}
                            onClick={() => handleResultClick(result)}
                            className={`w-full text-left p-3 sm:p-4 ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-50'} transition-colors`}
                          >
                            {result.type === 'module' ? (
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                                  <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className={`font-medium text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`}>{result.moduleTitle}</p>
                                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Module</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-3 min-w-0">
                                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                                  <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.36-2 4.272-2C14.528 7 16 8.153 16 9.5c0 1.657-1.623 2.417-3.176 3.01-.842.326-1.475.77-1.475 1.49v.5M12 17h.01M9 12h6" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-medium text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`}>
                                    {(result.questionText && result.questionText.length > 60 ? result.questionText.substring(0, 60) + '...' : result.questionText)}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    <span className={`text-xs px-1.5 py-0.5 rounded truncate max-w-[100px] sm:max-w-[120px] ${isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                      {result.moduleTitle}
                                    </span>
                                    {result.chapter && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded truncate max-w-[80px] sm:max-w-[100px] ${isDarkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                                        {result.chapter}
                                      </span>
                                    )}
                                    {result.year && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded truncate max-w-[60px] sm:max-w-[80px] ${isDarkMode ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-600'}`}>
                                        {result.year}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className={`p-4 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm">Aucun résultat trouvé</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mb-3`}>Accès rapide</h3>
                <div className="flex flex-wrap gap-2">
                  {modules.slice(0, 5).map((mod) => (
                    <Link
                      key={mod.id}
                      href={`/modules/${mod.id}`}
                      className={`px-3 py-1.5 rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700'} cursor-pointer transition-all`}
                    >
                      {mod.title}
                    </Link>
                  ))}
                  <Link
                    href="/modules"
                    className="px-3 py-1.5 rounded-lg text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 cursor-pointer transition-all shadow-sm"
                  >
                    +{modules.length - 5} plus
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 shadow-sm border ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
              Actions rapides
            </h2>
            <div className="space-y-3">
              <Link
                href="/modules"
                className={`flex items-center justify-between p-3 rounded-xl ${isDarkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-green-50'} transition-all cursor-pointer group`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div>
                    <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Modules</p>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Parcourir les annales
                    </span>
                  </div>
                </div>
                <svg className={`w-5 h-5 ${isDarkMode ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-green-600'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/progress"
                className={`flex items-center justify-between p-3 rounded-xl ${isDarkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-purple-50'} transition-all cursor-pointer group`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/25">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Progression</p>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Voir vos statistiques
                    </span>
                  </div>
                </div>
                <svg className={`w-5 h-5 ${isDarkMode ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-purple-600'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className={`text-lg sm:text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Modules populaires
            </h2>
            <Link href="/modules" className={`text-sm font-medium ${isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'} transition-colors flex items-center gap-1`}>
              Voir tout
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {modules.slice(0, 4).map((module) => {
              const stats = moduleStats.get(module.id);
              return (
                <Link
                  key={module.id}
                  href={`/modules/${module.id}`}
                  className="group"
                >
                  <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <div className={`h-24 bg-gradient-to-br ${module.gradient} relative overflow-hidden flex items-center justify-center`}>
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
                      <div className="relative z-10 text-white text-center">
                        <div className="text-2xl font-bold">{stats?.questionCount || '...'}</div>
                        <div className="text-xs text-white/80">questions</div>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className={`font-semibold text-sm group-hover:text-green-600 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`}>
                        {module.title}
                      </h3>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                        {module.levels.join(', ')} · {stats ? `${stats.chapterCount} chapitres` : '...'}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm border ${isDarkMode ? 'border-gray-700' : 'border-gray-100'} overflow-hidden`}>
            <button
              type="button"
              onClick={() => { setShowAdmin((v) => !v); setAdminStatus(null); }}
              className={`w-full flex items-center justify-between p-5 sm:p-6 ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'} transition-colors`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="text-left">
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Ajouter des questions</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Créer un module ou enrichir un existant (local dev only)</p>
                </div>
              </div>
              <svg className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} transition-transform ${showAdmin ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdmin && (
              <div className={`p-5 sm:p-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <button
                    type="button"
                    onClick={() => { setAdminTab('automatic'); setAdminStatus(null); }}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      adminTab === 'automatic'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Mode automatique
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdminTab('manual'); setAdminStatus(null); }}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      adminTab === 'manual'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Mode manuel
                  </button>
                </div>

                {adminTab === 'automatic' ? (
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={runScan}
                        disabled={scanLoading}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} disabled:opacity-60`}
                      >
                        {scanLoading ? 'Scan…' : 'Scanner les fichiers'}
                      </button>
                      <button
                        type="button"
                        onClick={runSync}
                        disabled={scanSyncing || !scanData}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {scanSyncing ? 'Sync…' : 'Synchroniser'}
                      </button>
                    </div>

                    {!scanData && !scanLoading && (
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Cliquez sur « Scanner les fichiers » pour vérifier l état des JSON présents sur le disque.
                      </p>
                    )}

                    {scanData && (
                      <div className="grid gap-4">
                        {scanData.missing.length > 0 && (
                          <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                            <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                              Modules sans fichier JSON ({scanData.missing.length})
                            </h3>
                            <ul className="space-y-1">
                              {scanData.missing.map((m) => (
                                <li key={m.id} className={`text-xs ${isDarkMode ? 'text-red-200' : 'text-red-700'}`}>
                                  id {m.id} · {m.title} ({m.json_filename}.json — introuvable)
                                </li>
                              ))}
                            </ul>
                            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              « Synchroniser » supprimera ces entrées de index.ts.
                            </p>
                          </div>
                        )}

                        {scanData.orphans.length > 0 && (
                          <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-amber-900/30 border border-amber-700' : 'bg-amber-50 border border-amber-200'}`}>
                            <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                              Fichiers JSON non enregistrés ({scanData.orphans.length})
                            </h3>
                            <ul className="space-y-1 max-h-48 overflow-y-auto">
                              {scanData.orphans.map((o) => (
                                <li key={o.json_filename} className={`text-xs ${isDarkMode ? 'text-amber-200' : 'text-amber-700'}`}>
                                  {o.json_filename}.json — {o.questionCount} question(s)
                                </li>
                              ))}
                            </ul>
                            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              « Synchroniser » ajoutera un module pour chacun (titre déduit du nom de fichier).
                            </p>
                          </div>
                        )}

                        <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-gray-700/50 border border-gray-600' : 'bg-gray-50 border border-gray-200'}`}>
                          <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                            Modules enregistrés ({scanData.registered.length})
                          </h3>
                          <div className="space-y-1 max-h-56 overflow-y-auto">
                            {scanData.registered.map((m) => (
                              <div key={m.id} className={`flex items-center justify-between gap-2 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                <span className="truncate">
                                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${m.exists ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                  id {m.id} · {m.title} — {m.exists ? `${m.questionCount} Q` : 'fichier manquant'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => { setRemoveTarget(m.id); setRemoveDeleteFile(true); }}
                                  className={`px-2 py-1 rounded ${isDarkMode ? 'bg-red-900/40 text-red-200 hover:bg-red-800/60' : 'bg-red-100 text-red-700 hover:bg-red-200'} transition-colors`}
                                >
                                  Supprimer
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {removeTarget !== null && (
                          <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-gray-700 border border-gray-600' : 'bg-white border border-gray-200'}`}>
                            <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                              Confirmer la suppression du module id {removeTarget} ?
                            </p>
                            <label className={`flex items-center gap-2 text-xs mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              <input
                                type="checkbox"
                                checked={removeDeleteFile}
                                onChange={(e) => setRemoveDeleteFile(e.target.checked)}
                                className="rounded"
                              />
                              Supprimer aussi le fichier JSON du disque
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={runRemove}
                                disabled={scanSyncing}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                              >
                                {scanSyncing ? 'Suppression…' : 'Supprimer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(null)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-colors`}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}

                        {scanData.orphans.length > 0 && (
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Années (sync auto)</label>
                              <div className="flex flex-wrap gap-2">
                                {LEVEL_OPTIONS.map((level) => (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() => setSyncLevels((prev) => prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level])}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                      syncLevels.includes(level)
                                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                        : isDarkMode
                                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Dégradé (sync auto)</label>
                              <div className="flex flex-wrap gap-2">
                                {GRADIENT_OPTIONS.map((g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => setSyncGradient(g)}
                                    className={`h-8 w-12 rounded-lg bg-gradient-to-br ${g} ${syncGradient === g ? 'ring-2 ring-offset-2 ring-green-500 ' + (isDarkMode ? 'ring-offset-gray-800' : 'ring-offset-white') : ''}`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {scanData.orphans.length === 0 && scanData.missing.length === 0 && (
                          <p className={`text-xs ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                            Tout est synchronisé : chaque module a son fichier JSON et aucun fichier orphelin.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                <form onSubmit={handleAdminSubmit}>
                  <div className="grid gap-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => setAdminMode('new')}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          adminMode === 'new'
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm'
                            : isDarkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Nouveau module
                      </button>
                    <button
                      type="button"
                      onClick={() => setAdminMode('append')}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        adminMode === 'append'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm'
                          : isDarkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Ajouter à un module existant
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Titre {adminMode === 'new' ? '(devient aussi le sous-sujet de toutes les questions)' : '(sous-sujet imposé à toutes les questions)'}
                      </label>
                      <input
                        type="text"
                        value={adminTitle}
                        onChange={(e) => setAdminTitle(e.target.value)}
                        placeholder="Ex. Cardiologie"
                        className={`w-full px-3 py-2.5 rounded-lg border outline-none text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-green-500'}`}
                      />
                    </div>

                    {adminMode === 'append' ? (
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Module cible</label>
                        <select
                          value={adminModuleId}
                          onChange={(e) => setAdminModuleId(Number(e.target.value))}
                          className={`w-full px-3 py-2.5 rounded-lg border outline-none text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-green-500'}`}
                        >
                          {modules.map((m) => (
                            <option key={m.id} value={m.id}>{m.title} (id {m.id})</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Description</label>
                        <input
                          type="text"
                          value={adminDescription}
                          onChange={(e) => setAdminDescription(e.target.value)}
                          placeholder="Courte description du module"
                          className={`w-full px-3 py-2.5 rounded-lg border outline-none text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-green-500'}`}
                        />
                      </div>
                    )}
                  </div>

                  {adminMode === 'new' && (
                    <>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Années</label>
                        <div className="flex flex-wrap gap-2">
                          {LEVEL_OPTIONS.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => toggleLevel(level)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                adminLevels.includes(level)
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                  : isDarkMode
                                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Dégradé</label>
                        <div className="flex flex-wrap gap-2">
                          {GRADIENT_OPTIONS.map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setAdminGradient(g)}
                              title={g}
                              className={`h-8 w-12 rounded-lg bg-gradient-to-br ${g} ${adminGradient === g ? 'ring-2 ring-offset-2 ring-green-500 ' + (isDarkMode ? 'ring-offset-gray-800' : 'ring-offset-white') : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Questions (JSON — format JsonQuestion)</label>
                    <textarea
                      value={adminQuestions}
                      onChange={(e) => setAdminQuestions(e.target.value)}
                      placeholder='[ { "QuestionText": "...", "Choice_A_Text": "...", "Choice_A_isCorrect": false, ... } ]'
                      rows={10}
                      className={`w-full px-3 py-2.5 rounded-lg border outline-none text-sm font-mono ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-green-500'}`}
                    />
                  </div>

                  {adminStatus && (
                    <div className={`px-4 py-3 rounded-lg text-sm ${adminStatus.type === 'success' ? (isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700') : (isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700')}`}>
                      {adminStatus.message}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={adminSubmitting}
                      className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium text-sm hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {adminSubmitting ? 'Ajout en cours…' : adminMode === 'new' ? 'Créer le module' : 'Ajouter les questions'}
                    </button>
                  </div>
                </div>
                </form>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-xl overflow-hidden bg-gradient-to-r ${isDarkMode ? 'from-green-600 via-emerald-600 to-teal-600' : 'from-green-500 via-emerald-500 to-teal-500'} shadow-lg`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 sm:p-8 text-center sm:text-left">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Prêt à commencer ?</h2>
                <p className="text-green-100 text-sm">Explorez les modules et testez vos connaissances.</p>
              </div>
            </div>
            <Link
              href="/modules"
              className="px-6 py-3 bg-white text-green-600 font-semibold text-sm rounded-xl hover:bg-gray-100 transition-colors shadow-lg whitespace-nowrap"
            >
              Explorer les modules
            </Link>
          </div>
        </div>
      </main>

      <footer className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t py-6 mt-8`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              © 2026 LearnFMPA
            </p>
            <div className="flex space-x-6">
              <a href="/contact" className={`text-sm ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}>Contact</a>
              <a href="/faq" className={`text-sm ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}>FAQ</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
