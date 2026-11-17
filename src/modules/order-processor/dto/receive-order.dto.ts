import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiveOrderCustomerDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  cep?: string;
}

export class ReceiveOrderItemDto {
  @IsString()
  sku!: string;

  @IsNumber()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  unit_price!: number;
}

export class ReceiveOrderDto {
  @IsString()
  order_id!: string;

  @ValidateNested()
  @Type(() => ReceiveOrderCustomerDto)
  customer!: ReceiveOrderCustomerDto;

  @ValidateNested({ each: true })
  @Type(() => ReceiveOrderItemDto)
  @ArrayMinSize(1)
  items!: ReceiveOrderItemDto[];

  @IsString()
  currency!: string;

  @IsString()
  idempotency_key!: string;
}
