import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListOrdersQueryDto } from './dto/list-orders.query';
import { ReceiveOrderDto } from './dto/receive-order.dto';
import {
  GetOrderUseCase,
  OrderNotFoundError,
} from './use-cases/get-order.use-case';
import { ListOrdersUseCase } from './use-cases/list-orders.use-case';
import {
  InvalidOrderPayloadError,
  ReceiveOrderUseCase,
} from './use-cases/receive-order.use-case';

@ApiTags('Orders')
@Controller()
export class OrderProcessorController {
  private readonly logger = new Logger(OrderProcessorController.name);

  constructor(
    private readonly receiveOrder: ReceiveOrderUseCase,
    private readonly listOrders: ListOrdersUseCase,
    private readonly getOrder: GetOrderUseCase,
  ) {}

  @Post('webhooks/orders')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Body() payload: ReceiveOrderDto) {
    this.logger.log(
      `HTTP POST /webhooks/orders order_id=${payload.order_id} idempotency_key=${payload.idempotency_key}`,
    );

    try {
      const result = await this.receiveOrder.execute({
        payload: payload as unknown as Record<string, unknown>,
      });
      this.logger.log(
        `HTTP POST /webhooks/orders -> 202 order_id=${result.order_id} duplicate=${result.duplicate}`,
      );
      return result;
    } catch (error) {
      if (error instanceof InvalidOrderPayloadError) {
        this.logger.warn(
          `HTTP POST /webhooks/orders invalid payload: ${error.message}`,
        );
        throw new BadRequestException(error.message);
      }

      this.logger.error(
        `HTTP POST /webhooks/orders failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Get('orders')
  async list(@Query() query: ListOrdersQueryDto) {
    this.logger.log(
      `HTTP GET /orders${query.status ? `?status=${query.status}` : ''}`,
    );
    const orders = await this.listOrders.execute(query.status);
    this.logger.log(`HTTP GET /orders -> 200 count=${orders.length}`);
    return orders;
  }

  @Get('orders/:id')
  async getById(@Param('id') id: string) {
    this.logger.log(`HTTP GET /orders/${id}`);

    try {
      const order = await this.getOrder.execute(id);
      this.logger.log(
        `HTTP GET /orders/${id} -> 200 status=${order.status ?? 'n/a'}`,
      );
      return order;
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        this.logger.warn(`HTTP GET /orders/${id} -> 404`);
        throw new NotFoundException(error.message);
      }

      this.logger.error(
        `HTTP GET /orders/${id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
