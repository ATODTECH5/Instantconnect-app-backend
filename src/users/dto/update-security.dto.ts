import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSecurityDto {
  @IsOptional()
  @IsBoolean()
  pinEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  biometricsEnabled?: boolean;
}
