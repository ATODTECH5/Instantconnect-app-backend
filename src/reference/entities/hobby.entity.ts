import { Entity } from 'typeorm';

import { LookupEntity } from './lookup.entity';

@Entity('hobbies')
export class Hobby extends LookupEntity {}
