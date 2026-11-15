import { createFileRoute } from 'typed-router';
import { PlaygroundHome } from '@/pages/PlaygroundHome';

export const Route = createFileRoute('/playground/')({
  component: PlaygroundHome,
});
