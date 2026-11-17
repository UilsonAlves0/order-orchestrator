import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ example: 'paid' })
  @IsOptional()
  @IsString()
  status?: string;
}
