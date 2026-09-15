import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
} from 'class-validator';

import type { SafetyCircle } from '../entities/safety-circle.entity';
import type { SafetyCircleMember } from '../entities/safety-circle-member.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

export class CreateCircleDto {
	@ApiProperty({ maxLength: 60, example: 'Immediate Family' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(60)
	name!: string;
}

export class AddMemberDto {
	@ApiProperty({ maxLength: 80, example: 'Mum' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	name!: string;

	@ApiProperty({ example: 'mum@example.com' })
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim().toLowerCase() : value,
	)
	@IsEmail()
	@MaxLength(255)
	email!: string;

	@ApiPropertyOptional({
		example: '+2348012345678',
		description: 'Stored for a future SMS channel.',
	})
	@IsOptional()
	@trim
	@Matches(/^\+?[0-9]{7,15}$/, {
		message: 'phone must be 7 to 15 digits, with an optional leading +',
	})
	phone?: string;
}

/** The circles a participant wants told about one meetup. Replaces the previous set. */
export class SelectCirclesDto {
	@ApiProperty({ type: [String], format: 'uuid' })
	@IsArray()
	@ArrayMaxSize(20)
	@IsUUID('4', { each: true })
	circleIds!: string[];
}

export class CircleMemberResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	name: string;

	@ApiProperty()
	email: string;

	@ApiPropertyOptional({ nullable: true })
	phone: string | null;

	constructor(member: SafetyCircleMember) {
		this.id = member.id;
		this.name = member.name;
		this.email = member.email;
		this.phone = member.phone;
	}
}

export class CircleResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	name: string;

	@ApiProperty({ type: [CircleMemberResponseDto] })
	members: CircleMemberResponseDto[];

	@ApiProperty()
	createdAt: Date;

	constructor(circle: SafetyCircle) {
		this.id = circle.id;
		this.name = circle.name;
		this.members = (circle.members ?? []).map(
			(m) => new CircleMemberResponseDto(m),
		);
		this.createdAt = circle.createdAt;
	}
}

export class CircleListResponseDto {
	@ApiProperty({ type: [CircleResponseDto] })
	items: CircleResponseDto[];

	constructor(items: CircleResponseDto[]) {
		this.items = items;
	}
}

export class DispatchResultDto {
	@ApiProperty({ description: 'Contacts reached by this call.' })
	sent: number;

	@ApiProperty({
		description: 'Contacts that had already been reached for this trigger.',
	})
	alreadySent: number;

	@ApiProperty({ description: 'Contacts the mail provider refused.' })
	failed: number;

	constructor(sent: number, alreadySent: number, failed: number) {
		this.sent = sent;
		this.alreadySent = alreadySent;
		this.failed = failed;
	}
}

export class DispatchPlanDto {
	@ApiProperty({
		type: [String],
		format: 'uuid',
		description: 'Circles currently selected for this meetup.',
	})
	circleIds: string[];

	@ApiProperty({
		description: 'The check-in sentence, exactly as the email will lead.',
	})
	preview: string;

	constructor(circleIds: string[], preview: string) {
		this.circleIds = circleIds;
		this.preview = preview;
	}
}
