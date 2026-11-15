import { createFileRoute } from 'clear-safe-router';
import { PlaygroundHome } from '@/pages/PlaygroundHome';

export const Route = createFileRoute('/')({
  component: PlaygroundHome,
});
