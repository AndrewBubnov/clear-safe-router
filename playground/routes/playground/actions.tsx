import { createFileRoute, lazy } from 'clear-safe-router';

import { PageSkeleton } from '@/pages/Skeletons';
import { addNote, fetchNotes } from '@/pages/api';

export const Route = createFileRoute('/playground/actions')({
  loader: fetchNotes,
  pendingFallback: <PageSkeleton />,
  actions: () => ({
    addNote: async (data: Record<string, unknown>) => addNote(data['text'] as string),
  }),
  component: lazy(() => import('@/pages/ActionsPage')),
});
