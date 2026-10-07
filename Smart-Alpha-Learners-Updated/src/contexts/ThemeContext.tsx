import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type AppTheme = 'original' | 'forest-stone' | 'bronze-pearl' | 'garnet-bone';

export const THEME_OPTIONS: { id: AppTheme; name: string; description: string; primary: string; background: string }[] = [
  {
    id: 'original',
    name: 'Original Theme',
    description: 'Keep the application’s original green interface.',
    primary: '#047857',
    background: '#F1F5F9',
  },
  {
    id: 'forest-stone',
    name: 'Theme 1: Forest Green & Warm Stone',
    description: 'Forest green navigation and actions with a warm stone application background.',
    primary: '#1F3D28',
    background: '#D7D2C8',
  },
  {
    id: 'bronze-pearl',
    name: 'Theme 2: Bronze & Pearl',
    description: 'Bronze navigation and actions with a soft pearl application background.',
    primary: '#8D6613',
    background: '#EDE8E4',
  },
  {
    id: 'garnet-bone',
    name: 'Theme 3: Dark Garnet & Bone White',
    description: 'Dark garnet navigation and actions with a bone-white application background.',
    primary: '#781C2E',
    background: '#F9F6EE',
  },
];

interface ThemeContextValue { theme: AppTheme; setTheme: (theme: AppTheme) => void; }
const ThemeContext = createContext<ThemeContextValue>({ theme: 'original', setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('smart-alpha-theme') as AppTheme | null;
    return saved && THEME_OPTIONS.some((t) => t.id === saved) ? saved : 'original';
  });

  const setTheme = (next: AppTheme) => {
    setThemeState(next);
    localStorage.setItem('smart-alpha-theme', next);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
