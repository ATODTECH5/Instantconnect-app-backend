import { Entity } from 'typeorm';

import { LookupEntity } from './lookup.entity';

/**
 * What a user is here for: talents, business, friendship, social, general. One
 * per user, and the axis Discover filters its tabs on.
 */
@Entity('categories')
export class Category extends LookupEntity {}
