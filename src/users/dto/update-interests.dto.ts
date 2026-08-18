import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateInterestsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  interestIds: string[];
}
