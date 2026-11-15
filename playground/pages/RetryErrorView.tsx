import { Alert, Button } from '@mantine/core';
import { getRoute, Link } from 'clear-safe-router';

const route = getRoute('/playground/retry-raw');

const RetryErrorView = () => {
	const { loaderError } = route.useErrors();
	return (
		<div className="pg-wrap">
			<h1>Retry</h1>
			<Alert color="red">{loaderError?.message ?? 'Load failed'}</Alert>
			<p className="pg-hint">
				This twin route has <code>retry: 0</code>, so the failure above is final — the router rendered{' '}
				<code>errorElement</code> instead of retrying.
			</p>
			<div className="pg-row">
				<Button onClick={() => window.location.reload()} size="xs">
					Reload the page
				</Button>
				<Link to="/playground/retry">Go to the retrying version →</Link>
			</div>
			<p>
				<Link to="/playground">← Back to playground home</Link>
			</p>
		</div>
	);
};

export default RetryErrorView;
