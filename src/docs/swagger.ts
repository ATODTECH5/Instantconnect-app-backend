import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

export const DOCS_PATH = 'docs';

const DESCRIPTION = `
Backing API for the Instant Connect mobile app.

Every endpoint except sign up, sign in and the password reset flow needs a
bearer access token. Get one from \`POST /api/v1/auth/verify-email\` or
\`POST /api/v1/auth/sign-in\`, then paste it into **Authorize** above.

Access tokens are short lived. When one expires, exchange the refresh token at
\`POST /api/v1/auth/refresh\`: it returns a new pair and invalidates the old
one. Presenting a refresh token twice revokes the whole session family, so
store only the newest.

**Admin dashboard.** The \`Admin\` endpoints need an account with the admin
role. Call \`POST /api/v1/admin/auth/sign-in\` here with **Try it out**: it sets
the \`ic_admin_access\` and \`ic_admin_refresh\` httpOnly cookies, which this page
then sends automatically. A bearer token from \`/auth/sign-in\` on an admin
account works too.

Failures all share one envelope. Branch on \`code\`, never on \`message\`.
`.trim();

/** The security scheme name the admin controllers declare. */
export const ADMIN_SESSION_AUTH = 'admin-session';

/**
 * Swagger UI boots from an inline script, which helmet's default CSP blocks,
 * leaving a blank page. Only the docs routes get the relaxed policy; the API
 * keeps helmet's defaults.
 */
export function docsAwareHelmet(): (
	req: Request,
	res: Response,
	next: NextFunction,
) => void {
	const api = helmet();
	const docs = helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:', 'https:'],
				connectSrc: ["'self'"],
			},
		},
	});

	return (req, res, next) =>
		req.path === `/${DOCS_PATH}` || req.path.startsWith(`/${DOCS_PATH}/`)
			? docs(req, res, next)
			: api(req, res, next);
}

export function setupSwagger(app: INestApplication): void {
	const config = new DocumentBuilder()
		.setTitle('Instant Connect API')
		.setDescription(DESCRIPTION)
		.setVersion('1')
		.addBearerAuth(
			{ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
			'access-token',
		)
		.addCookieAuth(
			'ic_admin_access',
			{
				type: 'apiKey',
				in: 'cookie',
				description:
					'Set by POST /api/v1/admin/auth/sign-in. Browsers send it on their own.',
			},
			ADMIN_SESSION_AUTH,
		)
		.addTag('Auth', 'Registration, sign in, tokens and password reset')
		.addTag('Users', 'The signed in account')
		.addTag(
			'Reference',
			'Seeded pick lists: categories, occupations, hobbies',
		)
		.addTag('Health', 'Liveness probe for load balancers')
		.addTag('Admin Auth', 'Admin dashboard sign in, refresh and sign out')
		.addTag('Admin Dashboard', 'Overview cards, charts and recent activity')
		.addTag(
			'Admin Users',
			'Member directory, profiles, export and messaging',
		)
		.build();

	SwaggerModule.setup(
		DOCS_PATH,
		app,
		SwaggerModule.createDocument(app, config),
		{
			jsonDocumentUrl: `${DOCS_PATH}/json`,
			swaggerOptions: {
				persistAuthorization: true,
				tagsSorter: 'alpha',
				docExpansion: 'list',
			},
		},
	);
}
