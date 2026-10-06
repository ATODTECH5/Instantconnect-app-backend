import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AllowDuringMaintenance } from '../common/decorators/allow-during-maintenance.decorator';
import { Public } from '../common/decorators/public.decorator';

const APP_SCHEME = 'instantconnectclient://';

/**
 * The https half of a shared community or post link. Chat apps only make
 * http(s) links tappable, so the app shares these and the page hands over
 * to the app's own scheme. It names nothing about the community, since a
 * private one must not leak through a forwarded link.
 */
@ApiExcludeController()
@Public()
@AllowDuringMaintenance()
@Controller('links')
export class CommunityLinksController {
	@Get('communities/:id')
	@Header('Content-Type', 'text/html; charset=utf-8')
	@Header('Cache-Control', 'no-store')
	community(@Param('id', ParseUUIDPipe) id: string): string {
		return handoffPage(`${APP_SCHEME}/communities/${id}`);
	}

	@Get('community-posts/:id')
	@Header('Content-Type', 'text/html; charset=utf-8')
	@Header('Cache-Control', 'no-store')
	post(@Param('id', ParseUUIDPipe) id: string): string {
		return handoffPage(`${APP_SCHEME}/communities/posts/${id}`);
	}
}

/** Ids are validated as UUIDs, so the target needs no further escaping. */
function handoffPage(target: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${target}">
<title>Open in Instant Connect</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,system-ui,sans-serif;background:#fff;color:#1a1a1a;padding:0 16px}
main{max-width:360px;text-align:center}
a{display:inline-block;margin-top:16px;padding:14px 24px;border-radius:12px;background:#9333ea;color:#fff;text-decoration:none;font-weight:600}
p{color:#6b7280;line-height:1.5}
</style>
</head>
<body>
<main>
<h1>Instant Connect</h1>
<p>This link opens in the Instant Connect app.</p>
<a href="${target}">Open in the app</a>
<p>If nothing happens, install Instant Connect and open the link again.</p>
</main>
</body>
</html>`;
}
