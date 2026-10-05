import { BadRequestException, Injectable } from '@nestjs/common';

import { PlatformSettingsService } from './platform-settings.service';

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies the blocked words and domains from Content Moderation settings to
 * text members write. Words match whole, case insensitive, so "class" is not
 * caught by "ass". A domain matches with any subdomain, written as a link or
 * bare. The member is told something was refused but not which entry, so the
 * list cannot be probed one word at a time.
 */
@Injectable()
export class ContentPolicyService {
	private compiled: {
		words: readonly string[];
		domains: readonly string[];
		pattern: RegExp | null;
	} = { words: [], domains: [], pattern: null };

	constructor(private readonly settings: PlatformSettingsService) {}

	async assertAllowed(
		...texts: (string | null | undefined)[]
	): Promise<void> {
		const pattern = await this.pattern();

		if (!pattern) return;

		for (const text of texts) {
			if (text && pattern.test(text)) {
				throw new BadRequestException({
					code: 'BLOCKED_CONTENT',
					message:
						'This contains a word or link that isn’t allowed on Instant Connect. Edit it and try again.',
				});
			}
		}
	}

	/** Rebuilt only when the lists change; settings are cached for 15 seconds. */
	private async pattern(): Promise<RegExp | null> {
		const { blockedWords, blockedDomains } = await this.settings.current();

		if (
			blockedWords !== this.compiled.words ||
			blockedDomains !== this.compiled.domains
		) {
			const parts = [
				...blockedWords.map(
					(word) =>
						`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`,
				),
				...blockedDomains.map(
					(domain) =>
						`(?<![\\p{L}\\p{N}.-])(?:[\\p{L}\\p{N}-]+\\.)*${escapeRegExp(domain)}(?![\\p{L}\\p{N}-]|\\.[\\p{L}\\p{N}])`,
				),
			];

			this.compiled = {
				words: blockedWords,
				domains: blockedDomains,
				pattern:
					parts.length > 0 ? new RegExp(parts.join('|'), 'iu') : null,
			};
		}

		return this.compiled.pattern;
	}
}
