import { Module } from '@nestjs/common';
import { StockRecordsService } from './stock-records.service';
import { StockRecordsController } from './stock-records.controller';

@Module({
  providers: [StockRecordsService],
  controllers: [StockRecordsController],
  exports: [StockRecordsService],
})
export class StockRecordsModule {}
