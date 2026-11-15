import { Link } from 'clear-safe-router';
import { Route } from '../routes/playground/nest/$nestId/item/$itemId';
import { getCallCount } from './api';

const NestItemPage = () => {
	const { nestId, itemId } = Route.useParams();
	const { description } = Route.useLoaderData();
	return (
		<div className="pg-wrap">
			<h1>
				Item {itemId} of nest {nestId}
			</h1>
			<div className="pg-card">
				<p>{description}</p>
				<p>
					<span className="pg-badge">loader calls: {getCallCount(`nest-${nestId}-${itemId}`)}</span>
				</p>
			</div>
			<p>
				<Link to="/playground/nest/$nestId" params={{ nestId }}>← Back to nest {nestId}</Link>
			</p>
		</div>
	);
};

export default NestItemPage;
