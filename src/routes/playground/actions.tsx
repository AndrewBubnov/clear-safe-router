import { createFileRoute, lazy } from '../../index';

import { PageSkeleton } from '../../playground/Skeletons';
import { addNote, fetchNotes } from '../../playground/api';

export const Route = createFileRoute('/playground/actions')({
  loader: fetchNotes,
  pendingFallback: <PageSkeleton />,
  actions: () => ({
    addNote: async (data: Record<string, unknown>) => addNote(data['text'] as string),
  }),
  component: lazy(() => import('../../playground/ActionsPage')),
});
