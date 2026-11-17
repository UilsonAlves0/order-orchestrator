import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../../common/schemas/order.schema';
import { ProcessOrderUseCase } from './use-cases/process-order.use-case';
import { ReceiveOrderUseCase } from './use-cases/receive-order.use-case';
import { ListOrdersUseCase } from './use-cases/list-orders.use-case';
import { GetOrderUseCase } from './use-cases/get-order.use-case';
import {
  ORDER_PROCESSOR_DLQ_NAME,
  ORDER_PROCESSOR_QUEUE_NAME,
} from './constants/order-processor-queue.constants';
import { OrderProcessorQueuePublisher } from './publishers/order-processor-queue.publisher';
import { OrderProcessorWorker } from './consumers/order-processor.processor';
import { OrdersService } from './services/orders.service';
import { OrderProcessorController } from './order-processor.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    BullModule.registerQueue(
      {
        name: ORDER_PROCESSOR_QUEUE_NAME,
      },
      {
        name: ORDER_PROCESSOR_DLQ_NAME,
      },
    ),
    BullBoardModule.forFeature(
      {
        name: ORDER_PROCESSOR_QUEUE_NAME,
        adapter: BullMQAdapter,
      },
      {
        name: ORDER_PROCESSOR_DLQ_NAME,
        adapter: BullMQAdapter,
      },
    ),
  ],
  controllers: [OrderProcessorController],
  providers: [
    OrdersService,
    ReceiveOrderUseCase,
    ProcessOrderUseCase,
    ListOrdersUseCase,
    GetOrderUseCase,
    OrderProcessorWorker,
    OrderProcessorQueuePublisher,
  ],
})
export class OrderProcessorModule {}
