import { Entity } from 'typeorm';

import { LookupEntity } from './lookup.entity';

@Entity('occupations')
export class Occupation extends LookupEntity {}
