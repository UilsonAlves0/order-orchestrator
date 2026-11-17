import { Global, Module } from '@nestjs/common';
import {
  FRANKFURTER_CLIENT,
  FrankfurterClient,
  FrankfurterService,
} from './frankfurter.service';

@Global()
@Module({
  providers: [
    {
      provide: FRANKFURTER_CLIENT,
      useValue: {
        fetch: (url, init) => fetch(url, init),
      } satisfies FrankfurterClient,
    },
    FrankfurterService,
  ],
  exports: [FrankfurterService],
})
export class FrankfurterModule {}
