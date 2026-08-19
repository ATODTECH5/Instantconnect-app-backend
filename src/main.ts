import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { appConfig } from './config/configuration';
import { DOCS_PATH, docsAwareHelmet, setupSwagger } from './docs/swagger';

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });
	const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

	app.useLogger(app.get(Logger));
	app.use(docsAwareHelmet());
	app.enableCors({
		// An empty allow list means no browser origin is trusted. In development
		// that would break the Expo web build, which serves from a random port.
		origin: config.corsOrigins.length
			? config.corsOrigins
			: !config.isProduction,
		credentials: true,
	});

	app.setGlobalPrefix('api', { exclude: ['health'] });
	app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);

	// After the pipes and the versioning, so the document reflects the routes as
	// they are actually served rather than as they are declared.
	if (config.swaggerEnabled) setupSwagger(app);

	app.enableShutdownHooks();

	await app.listen(config.port);

	if (config.swaggerEnabled) {
		app.get(Logger).log(
			`API documentation on ${await app.getUrl()}/${DOCS_PATH}`,
		);
	}
}

void bootstrap();
