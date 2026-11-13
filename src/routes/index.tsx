import { createFileRoute, Link } from '../index';

export const Route = createFileRoute('/')({
  component: () => <main><h1>Typed Router</h1><Link to="/about">About</Link></main>,
});
