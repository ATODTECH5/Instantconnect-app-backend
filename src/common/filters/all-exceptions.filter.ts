import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

import type { RequestWithId } from '../types/request';

const POSTGRES_UNIQUE_VIOLATION = '23505';

type ErrorBody = {
	statusCode: number;
	code: string;
	message: string;
	details?: string[];
	requestId?: string;
	timestamp: string;
	path: string;
};

type NormalisedError = {
	status: number;
	code: string;
	message: string;
	details?: string[];
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger(AllExceptionsFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const http = host.switchToHttp();
		const request = http.getRequest<RequestWithId>();
		const response = http.getResponse<Response>();

		const normalised = this.normalise(exception);
		const body: ErrorBody = {
			statusCode: normalised.status,
			code: normalised.code,
			message: normalised.message,
			...(normalised.details ? { details: normalised.details } : {}),
			requestId: request.id,
			timestamp: new Date().toISOString(),
			path: request.url,
		};

		this.log(exception, body, request);
		response.status(normalised.status).json(body);
	}

	private normalise(exception: unknown): NormalisedError {
		if (exception instanceof HttpException) {
			return this.fromHttpException(exception);
		}

		if (
			exception instanceof QueryFailedError &&
			(exception.driverError as { code?: string } | undefined)?.code ===
				POSTGRES_UNIQUE_VIOLATION
		) {
			return {
				status: HttpStatus.CONFLICT,
				code: 'RESOURCE_CONFLICT',
				message: 'That record already exists.',
			};
		}

		return {
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Something went wrong. Please try again.',
		};
	}

	private fromHttpException(exception: HttpException): NormalisedError {
		const status = exception.getStatus();
		const fallbackCode = HttpStatus[status] ?? 'HTTP_ERROR';
		const payload = exception.getResponse();

		if (typeof payload === 'string') {
			return { status, code: fallbackCode, message: payload };
		}

		const { message, code } = payload as {
			message?: string | string[];
			code?: string;
		};

		// ValidationPipe reports every broken constraint as an array of sentences.
		if (Array.isArray(message)) {
			return {
				status,
				code: 'VALIDATION_FAILED',
				message: 'The request did not pass validation.',
				details: message,
			};
		}

		return {
			status,
			code: code ?? fallbackCode,
			message: message ?? exception.message,
		};
	}

	private log(
		exception: unknown,
		body: ErrorBody,
		request: RequestWithId,
	): void {
		const context = `${request.method} ${request.url} -> ${body.statusCode} ${body.code}`;

		if (body.statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
			this.logger.error(
				context,
				exception instanceof Error
					? exception.stack
					: String(exception),
			);
			return;
		}

		this.logger.warn(context);
	}
}
