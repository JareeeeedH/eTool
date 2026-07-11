import type { AccentColor } from '../types'

export function formCardClass(accent: AccentColor, isEditing: boolean): string {
  if (isEditing) {
    return 'shrink-0 rounded-lg border border-slate-200 border-l-4 border-l-amber-400 bg-white p-1.5 shadow-sm ring-1 ring-amber-100 sm:p-2'
  }
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    orange: 'border-l-orange-500',
  }[accent]
  return `shrink-0 rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-1.5 shadow-sm sm:p-2`
}

export function recordCardClass(accent: AccentColor): string {
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    orange: 'border-l-orange-500',
  }[accent]
  return `flex flex-col rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-1.5 shadow-sm`
}
