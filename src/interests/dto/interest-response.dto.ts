import type { Interest } from '../entities/interest.entity';

export class InterestResponseDto {
  id: string;
  label: string;

  constructor(interest: Interest) {
    this.id = interest.id;
    this.label = interest.label;
  }

  static fromMany(interests: Interest[]): InterestResponseDto[] {
    return interests.map((interest) => new InterestResponseDto(interest));
  }
}
