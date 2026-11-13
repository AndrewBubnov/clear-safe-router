import { createFileRoute } from '../index';
import { PlaygroundHome } from '../playground/PlaygroundHome';

export const Route = createFileRoute('/')({
  component: PlaygroundHome,
});
