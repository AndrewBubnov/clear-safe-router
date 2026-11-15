import { useMemo } from 'react';
import { Link } from 'clear-safe-router';
import { Route } from '../routes/playground/nest/$nestId/index';
import { getCallCount, randomIds } from './api';

const NestChildPage = () => {
	const { nestId } = Route.useParams();
	const { description } = Route.useLoaderData();
	const itemIds = useMemo(() => randomIds('item'), []);
	return (
		<div className="pg-wrap">
			<h1>Nest {nestId}</h1>
			<div className="pg-card">
				<p>{description}</p>
				<p>
					<span className="pg-badge">loader calls: {getCallCount(`nest-${nestId}`)}</span>
				</p>
			</div>
			<div className="pg-row">
				{itemIds.map(itemId => (
					<Link key={itemId} toRaw={`/playground/nest/${nestId}/item/${itemId}`} prefetch="none">
						{itemId}
					</Link>
				))}
			</div>
			<p>
				<Link to="/playground/nest">← Back to nests</Link>
			</p>
		</div>
	);
};

export default NestChildPage;
