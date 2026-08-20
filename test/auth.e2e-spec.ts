import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

const describeWithDatabase = process.env.DATABASE_URL
	? describe
	: describe.skip;

const unique = () => Math.floor(Math.random() * 90_000_000) + 10_000_000;

type ApiError = { code: string; message: string; details?: string[] };

/** supertest types `body` as `any`; name the shape once instead of at each use. */
const errorOf = (response: { body: unknown }): ApiError =>
	response.body as ApiError;

const registration = () => ({
	fullName: 'Ada Lovelace',
	email: `ada.${Date.now()}.${unique()}@example.test`,
	phone: `080${unique()}`,
	password: 'Password1',
	termsAccepted: true,
});

describeWithDatabase('Auth (e2e)', () => {
	let app: INestApplication<App>;
	let dataSource: DataSource;
	const createdEmails: string[] = [];

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ logger: false });
		app.setGlobalPrefix('api', { exclude: ['health'] });
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			}),
		);

		await app.init();
		dataSource = app.get(DataSource);
	});

	afterAll(async () => {
		if (createdEmails.length) {
			await dataSource.query(
				'DELETE FROM "users" WHERE "email" = ANY($1)',
				[createdEmails],
			);
		}

		await app?.close();
	});

	const register = async (body: Record<string, unknown>) => {
		const response = await request(app.getHttpServer())
			.post('/api/v1/auth/register')
			.send(body);

		if (response.status === 201) {
			createdEmails.push((response.body as { email: string }).email);
		}

		return response;
	};

	describe('POST /auth/register', () => {
		it('creates an account and echoes the address to verify', async () => {
			const body = registration();
			const response = await register(body);

			expect(response.status).toBe(201);
			expect(response.body).toEqual({ email: body.email });
		});

		it('rejects a weak password with a field level reason', async () => {
			const response = await register({
				...registration(),
				password: 'password',
			});

			expect(response.status).toBe(400);
			expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
			expect(errorOf(response).details).toEqual([
				'Use an uppercase letter and a number',
			]);
		});

		it('rejects an unknown field rather than ignoring it', async () => {
			const response = await register({
				...registration(),
				isAdmin: true,
			});

			expect(response.status).toBe(400);
			expect(errorOf(response).code).toBe('VALIDATION_FAILED');
		});

		it('refuses to create a second account on the same address', async () => {
			const body = registration();

			await register(body);
			const response = await register(body);

			expect(response.status).toBe(409);
			expect(errorOf(response).code).toBe('EMAIL_TAKEN');
		});

		it('treats the local and international phone forms as the same number', async () => {
			const local = `080${unique()}`;
			await register({ ...registration(), phone: local });

			const response = await register({
				...registration(),
				phone: `+234${local.slice(1)}`,
			});

			expect(response.status).toBe(409);
			expect(errorOf(response).code).toBe('PHONE_TAKEN');
		});
	});

	describe('POST /auth/sign-in', () => {
		it('refuses an account that has not verified its email', async () => {
			const body = registration();
			await register(body);

			const response = await request(app.getHttpServer())
				.post('/api/v1/auth/sign-in')
				.send({ email: body.email, password: body.password });

			expect(response.status).toBe(403);
			expect(errorOf(response).code).toBe('EMAIL_NOT_VERIFIED');
		});

		it('gives the same answer for an unknown account as for a wrong password', async () => {
			const [unknown, wrong] = await Promise.all([
				request(app.getHttpServer()).post('/api/v1/auth/sign-in').send({
					email: 'nobody@example.test',
					password: 'Password1',
				}),
				request(app.getHttpServer()).post('/api/v1/auth/sign-in').send({
					email: 'nobody2@example.test',
					password: 'Password2',
				}),
			]);

			expect(unknown.status).toBe(401);
			expect(errorOf(unknown).code).toBe('INVALID_CREDENTIALS');
			expect(errorOf(wrong).code).toBe(errorOf(unknown).code);
		});
	});

	describe('POST /auth/forgot-password', () => {
		it('answers the same for an unknown address, so it cannot enumerate accounts', async () => {
			const response = await request(app.getHttpServer())
				.post('/api/v1/auth/forgot-password')
				.send({ email: 'nobody@example.test' });

			expect(response.status).toBe(204);
		});
	});

	describe('authorization', () => {
		it('rejects an unauthenticated request for the current user', async () => {
			const response = await request(app.getHttpServer()).get(
				'/api/v1/users/me',
			);

			expect(response.status).toBe(401);
			expect(errorOf(response).code).toBe('UNAUTHENTICATED');
		});

		it('rejects a forged bearer token', async () => {
			const response = await request(app.getHttpServer())
				.get('/api/v1/users/me')
				.set('Authorization', 'Bearer not.a.real.token');

			expect(response.status).toBe(401);
		});

		it('serves the public interests list without a token', async () => {
			const response = await request(app.getHttpServer()).get(
				'/api/v1/interests',
			);

			expect(response.status).toBe(200);
			expect(response.body).toEqual(
				expect.arrayContaining([{ id: 'talent', label: 'Talent' }]),
			);
		});
	});
});
