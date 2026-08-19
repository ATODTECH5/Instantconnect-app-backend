import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The shape `AllExceptionsFilter` returns for every failure, documented once. */
export class ApiErrorDto {
	@ApiProperty({ example: 401 })
	statusCode: number;

	@ApiProperty({
		description:
			'Stable machine readable reason. Switch on this, not on the message.',
		example: 'UNAUTHENTICATED',
	})
	code: string;

	@ApiProperty({
		description: 'Safe to show a user as written.',
		example: 'Sign in to continue.',
	})
	message: string;

	@ApiPropertyOptional({
		description:
			'Field level validation reasons, present only on VALIDATION_FAILED.',
		example: ['Use an uppercase letter and a number'],
		type: [String],
	})
	details?: string[];

	@ApiProperty({
		description: 'Correlates the response with the server log line.',
		example: 'afbf83a1-5189-4134-9812-6f4a6cb3ae79',
	})
	requestId: string;

	@ApiProperty({ example: '2026-08-19T07:12:03.114Z' })
	timestamp: string;

	@ApiProperty({ example: '/api/v1/users/me' })
	path: string;
}
