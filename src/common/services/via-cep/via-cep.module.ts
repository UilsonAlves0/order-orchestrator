import { Global, Module } from '@nestjs/common';
import { VIA_CEP_CLIENT, ViaCepClient, ViaCepService } from './via-cep.service';

@Global()
@Module({
  providers: [
    {
      provide: VIA_CEP_CLIENT,
      useValue: {
        fetch: (url, init) => fetch(url, init),
      } satisfies ViaCepClient,
    },
    ViaCepService,
  ],
  exports: [ViaCepService],
})
export class ViaCepModule {}
