import { getRoute, Link, useNavigate } from '../../src';
import { Route as CatchAllRoute } from '../../playground/routes/$';
import { Route as ProductRoute } from '../../playground/routes/playground/cache/product/$productId';

const validStatic = <Link to="/playground/settings">Settings</Link>;
const validDynamic = <Link to="/playground/cache/product/$productId" params={{ productId: '42' }} />;
const validCatchAll = <Link to="/$" params={{ _splat: 'docs/getting-started' }} />;
const validRaw = <Link toRaw="/runtime-generated-path/5" />;
const validRawWithOptions = <Link toRaw="/runtime-generated-path/5" replace search={{ tab: 'info' }} />;
const validNavigate = () => useNavigate()({ to: '/playground/cache/product/$productId', params: { productId: '7' } });
const validRawNavigate = () => useNavigate()('/runtime/path?x=1');
const validRawObjectNavigate = () => useNavigate()({ toRaw: '/runtime/path', replace: true });
const paramsAreTyped: string = ProductRoute.useParams().productId;
const catchAllParamsAreTyped: string = CatchAllRoute.useParams()._splat;
const loaderDataIsTyped: { description: string } = ProductRoute.useLoaderData();
// @ts-expect-error inferred loader data is typed — a wrong field access is a compile error
const loaderDataWrongField: number = ProductRoute.useLoaderData().description;
const validRoot = <Link to="/playground/" />;

// @ts-expect-error unknown route ID
const unknownRoute = <Link to="/does-not-exist" />;
// @ts-expect-error required path parameter
const missingParam = <Link to="/playground/cache/product/$productId" />;
// @ts-expect-error incorrect parameter name
const wrongParam = <Link to="/playground/cache/product/$productId" params={{ id: '7' }} />;
// @ts-expect-error catch-all requires its splat parameter
const missingCatchAllParam = <Link to="/$" />;
// @ts-expect-error static route does not accept params
const extraStaticParam = <Link to="/playground/settings" params={{ tab: 'info' }} />;
// @ts-expect-error unknown route rejected by navigate
const unknownNavigation = () => useNavigate()({ to: '/missing' });
// @ts-expect-error navigate needs dynamic params
const missingNavigateParam = () => useNavigate()({ to: '/playground/cache/product/$productId' });

const itemRouteApi = getRoute('/playground/nest/$nestId/item/$itemId');
const apiParamsAreTyped: { nestId: string; itemId: string } = itemRouteApi.useParams();
const apiParamsTypedInline: string = itemRouteApi.useParams().nestId;
const productRouteApi = getRoute('/playground/cache/product/$productId');
const apiProductParam: string = productRouteApi.useParams().productId;
// Loader data is inferred from the route's loader through the generated map.
const apiLoaderData: { description: string; loads: number } = productRouteApi.useLoaderData();
// @ts-expect-error api loader data is typed — a wrong field is a compile error
const apiLoaderDataWrongField: number = productRouteApi.useLoaderData().description;
const apiErrors: { loaderError: Error | null; beforeLoadError: Error | null } = productRouteApi.useErrors();
const apiStaticRoute = getRoute('/playground/settings');
// @ts-expect-error getRoute rejects unknown route IDs
const unknownApiRoute = getRoute('/does-not-exist');
// @ts-expect-error getRoute params are typed — a wrong property is a compile error
const apiWrongParam: string = itemRouteApi.useParams().bogus;
// @ts-expect-error params shape must match the route ID
const apiParamsWrongShape: { nestId: string; bogus: string } = itemRouteApi.useParams();

void [validStatic, validDynamic, validCatchAll, validRaw, validRawWithOptions, validNavigate, validRawNavigate, validRawObjectNavigate, paramsAreTyped, catchAllParamsAreTyped, loaderDataIsTyped, loaderDataWrongField, validRoot, unknownRoute, missingParam, wrongParam, missingCatchAllParam, extraStaticParam, unknownNavigation, missingNavigateParam, apiParamsAreTyped, apiParamsTypedInline, apiProductParam, apiLoaderData, apiLoaderDataWrongField, apiErrors, apiStaticRoute, unknownApiRoute, apiWrongParam, apiParamsWrongShape];
