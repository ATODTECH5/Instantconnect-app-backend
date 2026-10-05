import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { Category } from '../reference/entities/category.entity';
import { StorageModule } from '../storage/storage.module';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityPostsController } from './community-posts.controller';
import { CommunityPostsService } from './community-posts.service';
import { CommunityCommentLike } from './entities/community-comment-like.entity';
import { CommunityComment } from './entities/community-comment.entity';
import { CommunityInvite } from './entities/community-invite.entity';
import { CommunityMember } from './entities/community-member.entity';
import { CommunityPostLike } from './entities/community-post-like.entity';
import { CommunityPostMute } from './entities/community-post-mute.entity';
import { CommunityPost } from './entities/community-post.entity';
import { CommunityReport } from './entities/community-report.entity';
import { Community } from './entities/community.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Community,
			CommunityMember,
			CommunityInvite,
			CommunityPost,
			CommunityPostLike,
			CommunityPostMute,
			CommunityComment,
			CommunityCommentLike,
			CommunityReport,
			Category,
		]),
		BlocksModule,
		ChatModule,
		ConnectionsModule,
		NotificationsModule,
		PlatformSettingsModule,
		StorageModule,
	],
	controllers: [CommunitiesController, CommunityPostsController],
	providers: [CommunitiesService, CommunityPostsService],
	exports: [CommunitiesService, CommunityPostsService],
})
export class CommunitiesModule {}
